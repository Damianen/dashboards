// Obviously-fake demo data for finance_dev so the UI has something to show.
// Single user, dev DB, public repo => no real financial data. Idempotent:
// re-running clears the previous demo rows first.

import "dotenv/config";

import { Bank, ConnectionStatus, CreditDebit } from "@/generated/prisma/client";
import { persistRecurringSeries } from "@/server/services/recurrence";
import { prisma } from "@/server/db";

const dbName = new URL(process.env.DATABASE_URL ?? "").pathname.slice(1);
if (!dbName.endsWith("_dev")) {
  console.error(`Refusing: "${dbName}" is not a _dev database.`);
  process.exit(1);
}

const STATES = ["demo-ing", "demo-revolut", "demo-klarna"];
const SUB_KEYS = ["netflix", "spotify", "basic fit", "mobile vodafone"];

function day(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

/** Monthly dates (≈30d apart), newest = `lastSeen`, `count` of them, ascending. */
function monthlyDates(lastSeen: string, count: number): string[] {
  const end = day(lastSeen).getTime();
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    out.push(new Date(end - i * 30 * 86_400_000).toISOString().slice(0, 10));
  }
  return out;
}

async function main(): Promise<void> {
  // clean previous demo data
  await prisma.bankConnection.deleteMany({ where: { state: { in: STATES } } });
  await prisma.recurringSeries.deleteMany({
    where: { merchantKey: { in: SUB_KEYS } },
  });

  const catId = new Map(
    (await prisma.category.findMany({ select: { id: true, name: true } })).map(
      (c) => [c.name, c.id],
    ),
  );
  const cat = (name: string) => catId.get(name) ?? null;

  const ing = await prisma.bankConnection.create({
    data: {
      bank: Bank.ING,
      aspspName: "ING",
      aspspCountry: "NL",
      state: "demo-ing",
      status: ConnectionStatus.AUTHORIZED,
      authorizedAt: day("2026-01-01"),
      accounts: {
        create: { externalUid: "demo-ing-checking", name: "Betaalrekening", currency: "EUR" },
      },
    },
    include: { accounts: true },
  });
  const revolut = await prisma.bankConnection.create({
    data: {
      bank: Bank.REVOLUT,
      aspspName: "Revolut",
      aspspCountry: "LT",
      state: "demo-revolut",
      status: ConnectionStatus.AUTHORIZED,
      authorizedAt: day("2026-01-01"),
      accounts: {
        create: { externalUid: "demo-rev-savings", name: "Savings", currency: "EUR" },
      },
    },
    include: { accounts: true },
  });
  const klarna = await prisma.bankConnection.create({
    data: {
      bank: Bank.KLARNA,
      aspspName: "Klarna",
      aspspCountry: "NL",
      state: "demo-klarna",
      status: ConnectionStatus.AUTHORIZED,
      authorizedAt: day("2026-03-01"),
      accounts: {
        create: { externalUid: "demo-klarna-acct", name: "Klarna", currency: "EUR" },
      },
    },
    include: { accounts: true },
  });
  const checking = ing.accounts[0].id;
  const savings = revolut.accounts[0].id;
  const klarnaAcct = klarna.accounts[0].id;

  let n = 0;
  const rows: {
    accountId: string;
    bookingDate: Date;
    amount: string;
    counterparty: string;
    categoryId?: string | null;
    merchantKey?: string | null;
  }[] = [];

  const add = (
    accountId: string,
    date: string,
    amount: string,
    counterparty: string,
    categoryName?: string,
    merchantKey?: string,
  ) => {
    rows.push({
      accountId,
      bookingDate: day(date),
      amount,
      counterparty,
      categoryId: categoryName ? cat(categoryName) : null,
      merchantKey: merchantKey ?? null,
    });
  };

  // --- subscriptions (merchantKey set so detection groups them) ---
  const subs: {
    key: string;
    name: string;
    lastSeen: string;
    count: number;
    amounts: (i: number, n: number) => string;
  }[] = [
    {
      key: "netflix",
      name: "Netflix",
      lastSeen: "2026-06-11",
      count: 6,
      amounts: (i, c) => (i < c - 3 ? "-9.99" : "-12.99"), // price increase
    },
    { key: "spotify", name: "Spotify", lastSeen: "2026-06-04", count: 6, amounts: () => "-5.99" },
    { key: "mobile vodafone", name: "Vodafone", lastSeen: "2026-05-27", count: 4, amounts: () => "-15.00" },
    { key: "basic fit", name: "Basic-Fit", lastSeen: "2026-05-07", count: 5, amounts: () => "-29.99" }, // missed
  ];
  for (const s of subs) {
    const dates = monthlyDates(s.lastSeen, s.count);
    dates.forEach((d, i) =>
      add(checking, d, s.amounts(i, s.count), s.name, "Subscriptions", s.key),
    );
  }

  // --- six months of salary + rent (drives the trend chart) ---
  for (const m of ["01", "02", "03", "04", "05", "06"]) {
    add(checking, `2026-${m}-01`, "3200.00", "ACME Payroll", "Salary");
    add(checking, `2026-${m}-01`, "-1200.00", "Housing Corp", "Housing");
  }

  // --- current-month (June) everyday spend ---
  add(checking, "2026-06-02", "-75.00", "Energie NL", "Utilities");
  add(checking, "2026-06-03", "-54.20", "Albert Heijn", "Groceries");
  add(checking, "2026-06-05", "-42.00", "NS Reizigers", "Transport");
  add(checking, "2026-06-06", "-24.50", "Cafe Central", "Eating out");
  add(checking, "2026-06-08", "-38.75", "Jumbo", "Groceries");
  add(checking, "2026-06-09", "-89.99", "Bol.com", "Shopping");
  add(checking, "2026-06-13", "-18.00", "Pizza Place", "Eating out");
  add(checking, "2026-06-14", "-61.40", "Albert Heijn", "Groceries");
  // Klarna BNPL: a purchase paid via Klarna (left uncategorized -> inbox).
  add(klarnaAcct, "2026-06-10", "-39.98", "Zalando via Klarna");

  await prisma.transaction.createMany({
    data: rows.map((r) => ({
      accountId: r.accountId,
      externalId: `demo-${n++}`,
      bookingDate: r.bookingDate,
      amount: r.amount,
      currency: "EUR",
      creditDebit: r.amount.startsWith("-") ? CreditDebit.DBIT : CreditDebit.CRDT,
      counterparty: r.counterparty,
      categoryId: r.categoryId,
      merchantKey: r.merchantKey,
    })),
  });

  // --- balance snapshots (net-worth history + current total) ---
  const snaps: [string, string, string][] = [
    [checking, "2026-01-01", "1500.00"],
    [checking, "2026-02-01", "1800.00"],
    [checking, "2026-03-01", "1700.00"],
    [checking, "2026-04-01", "2100.00"],
    [checking, "2026-05-01", "2400.00"],
    [checking, "2026-06-01", "2750.00"],
    [checking, "2026-06-15", "2900.00"],
    [savings, "2026-01-01", "8000.00"],
    [savings, "2026-02-01", "8500.00"],
    [savings, "2026-03-01", "9000.00"],
    [savings, "2026-04-01", "9500.00"],
    [savings, "2026-05-01", "10200.00"],
    [savings, "2026-06-01", "11000.00"],
    [savings, "2026-06-15", "11500.00"],
    // Klarna balance is what's currently owed (negative).
    [klarnaAcct, "2026-06-01", "-19.99"],
    [klarnaAcct, "2026-06-15", "-39.98"],
  ];
  await prisma.balanceSnapshot.createMany({
    data: snaps.map(([accountId, date, amount]) => ({
      accountId,
      date: day(date),
      amount,
    })),
  });

  const rec = await persistRecurringSeries(new Date());
  console.log(
    `Seeded ${rows.length} transactions, ${snaps.length} snapshots, ${rec.detected} recurring series.`,
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
