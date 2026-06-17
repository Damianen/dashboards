import { Prisma } from "@/generated/prisma/client";
import { lastNMonthStarts } from "@/lib/analytics";
import { DEFAULT_TIMEZONE, zonedDateString } from "@/lib/dates";
import {
  buildNetWorthHistory,
  type NetWorthAccountBalance,
  type NetWorthAccountMeta,
  type NetWorthCurrent,
  type NetWorthHistory,
  type NetWorthSnapshot,
} from "@/lib/net-worth";
import { prisma } from "@/server/db";

// Net worth from BalanceSnapshot. The current total is one DISTINCT ON query
// (latest snapshot per account); the history merge (carry-forward across a
// unified date axis) is the pure, table-tested buildNetWorthHistory — this layer
// only loads rows and converts Decimal → exact integer cents.

function dateOnly(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

/** Latest balance per account (on or before today) + summed total. */
export async function getNetWorth(
  now: Date = new Date(),
  tz: string = DEFAULT_TIMEZONE,
): Promise<NetWorthCurrent> {
  const upper = zonedDateString(now, tz);
  const rows = await prisma.$queryRaw<
    Array<{
      accountId: string;
      date: Date;
      amount: string;
      currency: string;
      accountName: string | null;
      bank: string;
    }>
  >(Prisma.sql`
    SELECT DISTINCT ON (bs."accountId")
      bs."accountId" AS "accountId", bs.date AS date, bs.amount AS amount,
      bs.currency AS currency, a.name AS "accountName", c.bank::text AS bank
    FROM "BalanceSnapshot" bs
    JOIN "Account" a ON a.id = bs."accountId"
    JOIN "BankConnection" c ON c.id = a."connectionId"
    WHERE bs.date <= ${upper}::date
    ORDER BY bs."accountId", bs.date DESC
  `);

  let totalCents = 0;
  let asOf: string | null = null;
  const accounts: NetWorthAccountBalance[] = rows.map((r) => {
    const dateStr =
      r.date instanceof Date
        ? r.date.toISOString().slice(0, 10)
        : String(r.date).slice(0, 10);
    if (!asOf || dateStr > asOf) asOf = dateStr;
    const amount = new Prisma.Decimal(String(r.amount));
    totalCents += amount.times(100).toNumber();
    return {
      accountId: r.accountId,
      name: r.accountName ?? r.bank,
      bank: r.bank,
      balance: amount.toFixed(2),
      asOf: dateStr,
    };
  });

  return {
    asOf,
    currency: rows[0]?.currency ?? "EUR",
    total: new Prisma.Decimal(totalCents).div(100).toFixed(2),
    accounts,
  };
}

/** Per-account + combined balance history over the last `months` (carry-forward). */
export async function getNetWorthHistory(
  months = 12,
  now: Date = new Date(),
  tz: string = DEFAULT_TIMEZONE,
): Promise<NetWorthHistory> {
  const from = lastNMonthStarts(now, months, tz)[0];
  const upper = zonedDateString(now, tz);

  const [snapRows, accountRows] = await Promise.all([
    prisma.balanceSnapshot.findMany({
      where: { date: { gte: dateOnly(from), lte: dateOnly(upper) } },
      select: { accountId: true, date: true, amount: true },
      orderBy: { date: "asc" },
    }),
    prisma.account.findMany({
      select: { id: true, name: true, connection: { select: { bank: true } } },
    }),
  ]);

  const snapshots: NetWorthSnapshot[] = snapRows.map((s) => ({
    accountId: s.accountId,
    date: s.date.toISOString().slice(0, 10),
    amountCents: s.amount.times(100).toNumber(),
  }));
  const accounts: NetWorthAccountMeta[] = accountRows.map((a) => ({
    id: a.id,
    label: a.name ?? a.connection.bank,
    bank: a.connection.bank,
  }));

  return buildNetWorthHistory(snapshots, accounts);
}
