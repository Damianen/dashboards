import { DEFAULT_TIMEZONE, zonedDateString } from "@/lib/dates";
import {
  ConnectionStatus,
  Prisma,
  type Account,
  type BankConnection,
} from "@/generated/prisma/client";
import { prisma } from "@/server/db";

import {
  EnableBankingError,
  liveClient,
  type EbClient,
} from "./enable-banking/client";
import { categorizeNewTransactions } from "./categorize";
import { isConfigured } from "./enable-banking/config";
import { mapTransaction } from "./enable-banking/mapping";
import { persistRecurringSeries } from "./recurrence";
import type { EbBalance } from "./enable-banking/types";
import { computeSyncWindow, type SyncWindow } from "./sync-window";
import { detectAndLinkTransfers } from "./transfers";

// Per-account incremental fetch with idempotent upserts and one balance
// snapshot per account per run. The first sync after a fresh consent backfills
// deep history; later runs fetch an overlap window. Logging is counts / ids /
// durations only — NEVER payloads, IBANs, tokens, or the key.

const MAX_PAGES = 1000;

// Closing/available booked balance first; fall back to whatever the bank gave.
const PREFERRED_BALANCE_TYPES = ["CLBD", "CLAV", "XPCD", "ITAV", "OTHR"];

export interface SyncOptions {
  client?: EbClient;
  now?: Date;
  timeZone?: string;
}

export interface AccountSyncResult {
  accountId: string;
  externalUid: string;
  window: SyncWindow;
  fetched: number;
  inserted: number;
  skipped: number;
  balanceSnapshot: boolean;
}

export interface SyncSummary {
  connections: number;
  accounts: number;
  fetched: number;
  inserted: number;
  durationMs: number;
  status: "ok" | "not-configured" | "no-connections";
}

function pickBalance(balances: EbBalance[]): EbBalance | undefined {
  for (const type of PREFERRED_BALANCE_TYPES) {
    const match = balances.find((b) => b.balance_type === type);
    if (match) return match;
  }
  return balances[0];
}

function dateOnly(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

/** Sync one account: fetch its window page by page, insert new rows, snapshot. */
export async function syncAccount(
  account: Account,
  isFirstSync: boolean,
  opts: SyncOptions = {},
): Promise<AccountSyncResult> {
  const client = opts.client ?? liveClient;
  const now = opts.now ?? new Date();
  const timeZone = opts.timeZone ?? DEFAULT_TIMEZONE;

  const window = computeSyncWindow({
    isFirstSync,
    lastBookingDate: account.lastBookingDate,
    now,
    timeZone,
  });

  let fetched = 0;
  let inserted = 0;
  let skipped = 0;
  let maxBookingDate: Date | null = null;
  let continuationKey: string | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await client.getTransactions(account.externalUid, {
      dateFrom: window.dateFrom,
      dateTo: window.dateTo,
      continuationKey,
    });
    const rows: Prisma.TransactionCreateManyInput[] = [];
    for (const ebTx of res.transactions) {
      fetched++;
      try {
        const m = mapTransaction(account.id, ebTx);
        if (!maxBookingDate || m.bookingDate > maxBookingDate) {
          maxBookingDate = m.bookingDate;
        }
        rows.push({ accountId: account.id, ...m });
      } catch {
        // A transaction with no usable date can't be keyed — skip it.
        skipped++;
      }
    }
    if (rows.length > 0) {
      // skipDuplicates => insert-if-absent on (accountId, externalId): keeps
      // ingest idempotent and never overwrites an immutable existing row.
      const { count } = await prisma.transaction.createMany({
        data: rows,
        skipDuplicates: true,
      });
      inserted += count;
    }
    continuationKey = res.continuation_key ?? undefined;
    if (!continuationKey) break;
  }

  // Advance the incremental cursor; never move it backwards.
  const nextBookingDate =
    maxBookingDate &&
    (!account.lastBookingDate || maxBookingDate > account.lastBookingDate)
      ? maxBookingDate
      : account.lastBookingDate;
  await prisma.account.update({
    where: { id: account.id },
    data: { lastBookingDate: nextBookingDate, lastSyncedAt: now },
  });

  // One balance snapshot per account per run-day (unique accountId+date).
  let balanceSnapshot = false;
  try {
    const { balances } = await client.getBalances(account.externalUid);
    const chosen = pickBalance(balances);
    if (chosen) {
      const date = dateOnly(zonedDateString(now, timeZone));
      const amount = new Prisma.Decimal(chosen.balance_amount.amount);
      await prisma.balanceSnapshot.upsert({
        where: { accountId_date: { accountId: account.id, date } },
        update: {
          amount,
          currency: chosen.balance_amount.currency,
          balanceType: chosen.balance_type ?? null,
        },
        create: {
          accountId: account.id,
          date,
          amount,
          currency: chosen.balance_amount.currency,
          balanceType: chosen.balance_type ?? null,
        },
      });
      balanceSnapshot = true;
    }
  } catch (err) {
    // A balance failure must not lose the transactions we just ingested.
    logError("balances", account.id, err);
  }

  console.info(
    `[sync] account=${account.id} uid=${account.externalUid} window=${window.dateFrom}..${window.dateTo} fetched=${fetched} inserted=${inserted} skipped=${skipped} snapshot=${balanceSnapshot}`,
  );

  return {
    accountId: account.id,
    externalUid: account.externalUid,
    window,
    fetched,
    inserted,
    skipped,
    balanceSnapshot,
  };
}

/** Sync every account of one authorized connection. */
export async function syncConnection(
  connection: BankConnection & { accounts: Account[] },
  opts: SyncOptions = {},
): Promise<AccountSyncResult[]> {
  const now = opts.now ?? new Date();
  const isFirstSync = connection.initialSyncAt === null;
  const results: AccountSyncResult[] = [];

  try {
    for (const account of connection.accounts) {
      results.push(await syncAccount(account, isFirstSync, { ...opts, now }));
    }
    await prisma.bankConnection.update({
      where: { id: connection.id },
      data: {
        lastSyncedAt: now,
        initialSyncAt: connection.initialSyncAt ?? now,
        lastError: null,
        // A successful run clears the failure streak (sync-health re-arming).
        consecutiveFailures: 0,
      },
    });
  } catch (err) {
    if (err instanceof EnableBankingError && err.isConsentExpired) {
      await prisma.bankConnection.update({
        where: { id: connection.id },
        data: {
          status: ConnectionStatus.EXPIRED,
          lastError: err.code ?? "expired",
          consecutiveFailures: { increment: 1 },
        },
      });
    } else {
      await prisma.bankConnection.update({
        where: { id: connection.id },
        data: {
          lastError:
            err instanceof EnableBankingError ? (err.code ?? "error") : "error",
          consecutiveFailures: { increment: 1 },
        },
      });
    }
    logError("connection", connection.id, err);
    throw err;
  }

  return results;
}

/** Sync all authorized connections. No-op (logged) when EB isn't configured. */
export async function syncAll(opts: SyncOptions = {}): Promise<SyncSummary> {
  const startedAt = Date.now();

  // A test/fixture client bypasses the live-config guard.
  if (!opts.client && !isConfigured()) {
    console.info("[sync] skipped: Enable Banking is not configured");
    return summary(0, [], startedAt, "not-configured");
  }

  const connections = await prisma.bankConnection.findMany({
    where: { status: ConnectionStatus.AUTHORIZED },
    include: { accounts: true },
  });
  if (connections.length === 0) {
    console.info("[sync] no authorized connections");
    return summary(0, [], startedAt, "no-connections");
  }

  const all: AccountSyncResult[] = [];
  for (const connection of connections) {
    try {
      all.push(...(await syncConnection(connection, opts)));
    } catch {
      // syncConnection already recorded the error; keep syncing the others.
    }
  }

  // Post-ingest enrichment of the mutable fields only (merchantKey, categoryId,
  // isInternalTransfer, transferPairId), then recurring-series detection. Order
  // matters: merchantKey (categorize) and the transfer flags must be set before
  // recurrence groups by merchant and excludes transfers. Idempotent and
  // self-healing; a failure here must never lose the rows we just ingested.
  try {
    await categorizeNewTransactions();
    await detectAndLinkTransfers();
    await persistRecurringSeries(opts.now ?? new Date(), opts.timeZone);
  } catch (err) {
    logError("postsync", "all", err);
  }

  return summary(connections.length, all, startedAt, "ok");
}

function summary(
  connections: number,
  results: AccountSyncResult[],
  startMs: number,
  status: SyncSummary["status"],
): SyncSummary {
  const s: SyncSummary = {
    connections,
    accounts: results.length,
    fetched: results.reduce((n, r) => n + r.fetched, 0),
    inserted: results.reduce((n, r) => n + r.inserted, 0),
    durationMs: Date.now() - startMs,
    status,
  };
  console.info(
    `[sync] done status=${s.status} connections=${s.connections} accounts=${s.accounts} fetched=${s.fetched} inserted=${s.inserted} durationMs=${s.durationMs}`,
  );
  return s;
}

function logError(scope: string, id: string, err: unknown): void {
  if (err instanceof EnableBankingError) {
    console.error(`[sync] ${scope}=${id} EB error status=${err.status} code=${err.code ?? "?"}`);
  } else {
    const name = err instanceof Error ? err.name : "Error";
    console.error(`[sync] ${scope}=${id} ${name}`);
  }
}
