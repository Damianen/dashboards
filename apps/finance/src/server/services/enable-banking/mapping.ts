import { createHash } from "node:crypto";

import {
  CreditDebit,
  Prisma,
  TransactionStatus,
} from "@/generated/prisma/client";

import type { EbTransaction } from "./types";

// Pure mapping from an EB transaction to our row shape. No DB, no I/O — this is
// the dedupe + sign + counterparty logic, table-tested in mapping.test.ts.

const DBIT = "DBIT";

export interface MappedTransaction {
  externalId: string;
  bookingDate: Date;
  valueDate: Date | null;
  amount: Prisma.Decimal;
  currency: string;
  creditDebit: CreditDebit;
  status: TransactionStatus;
  counterparty: string | null;
  counterpartyIban: string | null;
  descriptionRaw: string | null;
  bankTransactionCode: string | null;
}

function isOutflow(ebTx: EbTransaction): boolean {
  return ebTx.credit_debit_indicator === DBIT;
}

/** Calendar date as a UTC-midnight Date, so @db.Date round-trips cleanly. */
function parseDateOnly(s: string): Date {
  return new Date(`${s}T00:00:00.000Z`);
}

function bookingDateString(ebTx: EbTransaction): string {
  const d = ebTx.booking_date ?? ebTx.value_date ?? ebTx.transaction_date;
  if (!d) throw new Error("transaction has no booking/value/transaction date");
  return d;
}

/** CRDT = inflow (+), DBIT = outflow (−). Always returns a signed Decimal. */
export function signedAmount(ebTx: EbTransaction): Prisma.Decimal {
  const magnitude = new Prisma.Decimal(ebTx.transaction_amount.amount).abs();
  return isOutflow(ebTx) ? magnitude.negated() : magnitude;
}

export function creditDebitOf(ebTx: EbTransaction): CreditDebit {
  return isOutflow(ebTx) ? CreditDebit.DBIT : CreditDebit.CRDT;
}

export function statusOf(ebTx: EbTransaction): TransactionStatus {
  return ebTx.status === "PENDING"
    ? TransactionStatus.PENDING
    : TransactionStatus.BOOK;
}

/**
 * Counterparty = the other side of the flow. For an outflow that's the
 * creditor (whom we paid); for an inflow it's the debtor (who paid us).
 */
export function deriveCounterparty(ebTx: EbTransaction): {
  name: string | null;
  iban: string | null;
} {
  const outflow = isOutflow(ebTx);
  const party = outflow ? ebTx.creditor : ebTx.debtor;
  const account = outflow ? ebTx.creditor_account : ebTx.debtor_account;
  return {
    name: party?.name?.trim() || null,
    iban: account?.iban?.trim() || null,
  };
}

/** Remittance lines joined into one raw description string. */
export function deriveDescription(ebTx: EbTransaction): string | null {
  const joined = (ebTx.remittance_information ?? [])
    .map((l) => l.trim())
    .filter(Boolean)
    .join(" ");
  return joined || null;
}

function bankTransactionCodeOf(ebTx: EbTransaction): string | null {
  const c = ebTx.bank_transaction_code;
  if (!c) return null;
  const parts = [c.code, c.sub_code].filter(Boolean);
  return parts.length ? parts.join("/") : null;
}

/**
 * Dedupe id, unique per (accountId, externalId). Prefer the bank's stable
 * references; only when neither exists do we hash the immutable fields
 * (apps/finance/CLAUDE.md). The hash includes the signed amount, counterparty
 * and raw description so two same-day, same-shop charges don't collide.
 */
export function computeExternalId(
  accountId: string,
  ebTx: EbTransaction,
): string {
  const stable = ebTx.entry_reference ?? ebTx.transaction_id;
  if (stable) return stable;

  const parts = [
    accountId,
    bookingDateString(ebTx),
    signedAmount(ebTx).toFixed(2),
    deriveCounterparty(ebTx).name ?? "",
    deriveDescription(ebTx) ?? "",
  ];
  return createHash("sha256").update(parts.join("|")).digest("hex");
}

/** Full EB → row mapping used by the sync service. */
export function mapTransaction(
  accountId: string,
  ebTx: EbTransaction,
): MappedTransaction {
  const cp = deriveCounterparty(ebTx);
  return {
    externalId: computeExternalId(accountId, ebTx),
    bookingDate: parseDateOnly(bookingDateString(ebTx)),
    valueDate: ebTx.value_date ? parseDateOnly(ebTx.value_date) : null,
    amount: signedAmount(ebTx),
    currency: ebTx.transaction_amount.currency,
    creditDebit: creditDebitOf(ebTx),
    status: statusOf(ebTx),
    counterparty: cp.name,
    counterpartyIban: cp.iban,
    descriptionRaw: deriveDescription(ebTx),
    bankTransactionCode: bankTransactionCodeOf(ebTx),
  };
}
