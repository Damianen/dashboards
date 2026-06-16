import { randomUUID } from "node:crypto";

import {
  Bank,
  ConnectionStatus,
  type BankConnection,
} from "@/generated/prisma/client";
import { evaluateSyncHealth } from "@/lib/sync-health";
import { prisma } from "@/server/db";

import {
  EnableBankingError,
  liveClient,
  type EbClient,
} from "./enable-banking/client";
import { aspspForBank, ebConfig } from "./enable-banking/config";
import { NotFoundError } from "./errors";

// Bank connection lifecycle: start consent (PENDING) → bank redirect →
// create session (AUTHORIZED) and persist the session id, valid_until and
// accounts. Pure adapters (server action, callback route) wrap these.

const CONSENT_DAYS = 180; // EB caps this at the ASPSP's maximum.

export const BANKS: Bank[] = [Bank.ING, Bank.REVOLUT];

function consentValidUntil(now: Date): string {
  return new Date(now.getTime() + CONSENT_DAYS * 86_400_000).toISOString();
}

function errCode(err: unknown): string {
  if (err instanceof EnableBankingError) return err.code ?? `http_${err.status}`;
  return "error";
}

/**
 * Create a PENDING connection and ask EB for the bank's authorization URL.
 * Returns the URL the user must be redirected to. On EB failure the pending
 * row is marked ERROR and the error rethrown.
 */
export async function startBankAuth(
  bank: Bank,
  client: EbClient = liveClient,
  now: Date = new Date(),
): Promise<string> {
  const aspsp = aspspForBank(bank);
  const { redirectUrl } = ebConfig();
  const state = randomUUID();

  await prisma.bankConnection.create({
    data: {
      bank,
      aspspName: aspsp.name,
      aspspCountry: aspsp.country,
      state,
      status: ConnectionStatus.PENDING,
    },
  });

  try {
    const { url } = await client.startAuth({
      aspsp,
      redirectUrl,
      state,
      validUntil: consentValidUntil(now),
    });
    return url;
  } catch (err) {
    await prisma.bankConnection.update({
      where: { state },
      data: { status: ConnectionStatus.ERROR, lastError: errCode(err) },
    });
    throw err;
  }
}

/**
 * Exchange the redirect `code` for a live session, then persist the session,
 * valid_until and the bank's accounts. Idempotent on account uid.
 */
export async function completeConnection(
  params: { state: string; code: string },
  client: EbClient = liveClient,
  now: Date = new Date(),
): Promise<BankConnection> {
  const pending = await prisma.bankConnection.findUnique({
    where: { state: params.state },
  });
  if (!pending) throw new NotFoundError("connection", params.state);

  const session = await client.createSession(params.code);
  const validUntil = session.access?.valid_until
    ? new Date(session.access.valid_until)
    : null;

  const connection = await prisma.bankConnection.update({
    where: { id: pending.id },
    data: {
      sessionId: session.session_id,
      validUntil,
      status: ConnectionStatus.AUTHORIZED,
      authorizedAt: now,
      psuType: session.psu_type ?? pending.psuType,
      aspspName: session.aspsp?.name ?? pending.aspspName,
      aspspCountry: session.aspsp?.country ?? pending.aspspCountry,
      lastError: null,
    },
  });

  for (const acct of session.accounts) {
    const fields = {
      iban: acct.account_id?.iban ?? null,
      name: acct.name ?? null,
      currency: acct.currency ?? "EUR",
      cashAccountType: acct.cash_account_type ?? null,
      product: acct.product ?? null,
    };
    await prisma.account.upsert({
      where: { externalUid: acct.uid },
      update: { connectionId: connection.id, ...fields },
      create: { connectionId: connection.id, externalUid: acct.uid, ...fields },
    });
  }

  return connection;
}

export async function markConnectionError(
  state: string,
  code: string,
): Promise<void> {
  await prisma.bankConnection.updateMany({
    where: { state },
    data: { status: ConnectionStatus.ERROR, lastError: code },
  });
}

export interface BankStatus {
  bank: Bank;
  status: ConnectionStatus | "NOT_CONNECTED";
  aspspName: string | null;
  validUntil: Date | null;
  daysOfValidity: number | null; // Amsterdam calendar days until consent expiry
  accountCount: number;
  lastSyncedAt: Date | null;
  lastError: string | null;
  consecutiveFailures: number;
  needsReconsent: boolean; // expiring within 7 days OR 3+ consecutive failures
}

/** Per-bank connection status for the settings page (latest authorized wins). */
export async function getBankStatuses(
  now: Date = new Date(),
): Promise<BankStatus[]> {
  const statuses: BankStatus[] = [];
  for (const bank of BANKS) {
    const authorized = await prisma.bankConnection.findFirst({
      where: { bank, status: ConnectionStatus.AUTHORIZED },
      orderBy: { authorizedAt: "desc" },
      include: { _count: { select: { accounts: true } } },
    });
    const conn =
      authorized ??
      (await prisma.bankConnection.findFirst({
        where: { bank },
        orderBy: { createdAt: "desc" },
        include: { _count: { select: { accounts: true } } },
      }));

    const health = conn
      ? evaluateSyncHealth(
          {
            id: conn.id,
            validUntil: conn.validUntil,
            lastSyncedAt: conn.lastSyncedAt,
            consecutiveFailures: conn.consecutiveFailures,
            status: conn.status,
          },
          now,
        )
      : null;

    statuses.push({
      bank,
      status: conn?.status ?? "NOT_CONNECTED",
      aspspName: conn?.aspspName ?? null,
      validUntil: conn?.validUntil ?? null,
      daysOfValidity: health?.daysOfValidity ?? null,
      accountCount: conn?._count.accounts ?? 0,
      lastSyncedAt: conn?.lastSyncedAt ?? null,
      lastError: conn?.lastError ?? null,
      consecutiveFailures: conn?.consecutiveFailures ?? 0,
      needsReconsent: health?.shouldAlert ?? false,
    });
  }
  return statuses;
}
