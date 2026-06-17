// End-to-end check for slice 4 (recurring detection + persistence, net worth,
// MCP-backing services) against finance_dev only. Synthetic data, self-cleaning.
// No live API, no real financial data (the repo is public).

import "dotenv/config";

import { Bank, ConnectionStatus, CreditDebit } from "@/generated/prisma/client";
import { getSpendingSummary } from "@/server/services/analytics";
import { getNetWorth, getNetWorthHistory } from "@/server/services/net-worth";
import {
  listSubscriptions,
  persistRecurringSeries,
} from "@/server/services/recurrence";
import { searchTransactions } from "@/server/services/transactions";
import { prisma } from "@/server/db";

// --- safety: never run against a non-dev database -------------------------

const dbName = (() => {
  try {
    return new URL(process.env.DATABASE_URL ?? "").pathname.slice(1);
  } catch {
    return "";
  }
})();
if (!dbName.endsWith("_dev")) {
  console.error(
    `Refusing to run: database "${dbName || "<unparseable>"}" does not end in _dev.`,
  );
  process.exit(1);
}

// --- mini harness ----------------------------------------------------------

let passed = 0;
const failures: { name: string; error: unknown }[] = [];

async function check(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (error) {
    failures.push({ name, error });
    const msg = error instanceof Error ? error.message : String(error);
    console.log(`  FAIL ${name}: ${msg}`);
  }
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function assertEqual<T>(actual: T, expected: T, msg: string): void {
  if (actual !== expected) {
    throw new Error(`${msg} (expected ${String(expected)}, got ${String(actual)})`);
  }
}

const NOW = new Date("2026-06-16T09:00:00Z");
const DAY = 86_400_000;
const runPrefix = `verify4-${Date.now()}`;
const FLIX = `${runPrefix} flixstream`;
const GYM = `${runPrefix} gymclub`;

/** UTC-midnight @db.Date `n` days before NOW. */
function dateAgo(n: number): Date {
  const d = new Date(NOW.getTime() - n * DAY);
  return new Date(`${d.toISOString().slice(0, 10)}T00:00:00.000Z`);
}

async function main(): Promise<void> {
  console.log(`Running finance slice-4 verify against "${dbName}"…`);

  const connection = await prisma.bankConnection.create({
    data: {
      bank: Bank.ING,
      aspspName: "Mock ASPSP",
      aspspCountry: "NL",
      state: `${runPrefix}-state`,
      status: ConnectionStatus.AUTHORIZED,
      authorizedAt: NOW,
    },
  });
  const accA = await prisma.account.create({
    data: { connectionId: connection.id, externalUid: `${runPrefix}-A`, name: "Checking" },
  });
  const accB = await prisma.account.create({
    data: { connectionId: connection.id, externalUid: `${runPrefix}-B`, name: "Savings" },
  });

  try {
    // --- recurring series fixtures (merchantKey set directly) -------------
    // Monthly, price increased 9.99 -> 12.99, last seen ~10d ago (active).
    const flix: { offset: number; amount: string }[] = [
      { offset: 160, amount: "-9.99" },
      { offset: 130, amount: "-9.99" },
      { offset: 100, amount: "-9.99" },
      { offset: 70, amount: "-12.99" },
      { offset: 40, amount: "-12.99" },
      { offset: 10, amount: "-12.99" },
    ];
    // Monthly, constant -30, last seen ~42d ago (overdue by ~12d -> missed).
    const gym = [132, 102, 72, 42].map((offset) => ({ offset, amount: "-30.00" }));

    let n = 0;
    const make = async (
      accountId: string,
      merchantKey: string,
      offset: number,
      amount: string,
    ) => {
      await prisma.transaction.create({
        data: {
          accountId,
          externalId: `${runPrefix}-tx-${n++}`,
          bookingDate: dateAgo(offset),
          amount,
          creditDebit: CreditDebit.DBIT,
          counterparty: merchantKey,
          merchantKey,
        },
      });
    };
    for (const f of flix) await make(accA.id, FLIX, f.offset, f.amount);
    for (const g of gym) await make(accA.id, GYM, g.offset, g.amount);

    // --- balance snapshots for net worth ----------------------------------
    const snap = async (accountId: string, date: string, amount: string) => {
      await prisma.balanceSnapshot.create({
        data: { accountId, date: new Date(`${date}T00:00:00.000Z`), amount },
      });
    };
    await snap(accA.id, "2026-04-01", "1000.00");
    await snap(accA.id, "2026-05-01", "1500.00");
    await snap(accA.id, "2026-06-01", "2000.00");
    await snap(accB.id, "2026-05-01", "500.00");
    await snap(accB.id, "2026-06-10", "750.00");

    // --- recurrence detection + persistence -------------------------------
    const result = await persistRecurringSeries(NOW);

    await check("persistRecurringSeries detects both fixture series", async () => {
      assert(result.detected >= 2, `detected >= 2 (got ${result.detected})`);
      const flixRow = await prisma.recurringSeries.findUnique({
        where: { merchantKey: FLIX },
      });
      assert(flixRow, "flix series persisted");
      assertEqual(flixRow.intervalDays, 30, "flix interval is monthly");
      assertEqual(flixRow.expectedAmount.toFixed(2), "-12.99", "flix current price");
      assertEqual(
        flixRow.previousAmount?.toFixed(2) ?? null,
        "-9.99",
        "flix previousAmount captured (price increase)",
      );
      assertEqual(flixRow.active, true, "flix active");
    });

    await check("listSubscriptions surfaces badges + monthly total", async () => {
      const { subscriptions, monthlyTotal } = await listSubscriptions(NOW);
      const flix = subscriptions.find((s) => s.merchantKey === FLIX);
      const gym = subscriptions.find((s) => s.merchantKey === GYM);
      assert(flix, "flix in active subscriptions");
      assertEqual(flix.amount, "12.99", "flix amount positive");
      assertEqual(flix.previousAmount, "9.99", "flix previousAmount positive");
      assertEqual(flix.priceIncreased, true, "flix price increase flagged");
      assertEqual(flix.intervalLabel, "Monthly", "flix interval label");
      assertEqual(flix.missed, false, "flix not missed");
      assert(gym, "gym in active subscriptions");
      assertEqual(gym.missed, true, "gym flagged missed");
      assert(/^\d+\.\d{2}$/.test(monthlyTotal), `monthly total is 2dp (${monthlyTotal})`);
    });

    await check("persistRecurringSeries is idempotent", async () => {
      const again = await persistRecurringSeries(NOW);
      assert(again.detected >= 2, "re-run still detects the series");
      const count = await prisma.recurringSeries.count({
        where: { merchantKey: { startsWith: runPrefix } },
      });
      assertEqual(count, 2, "no duplicate series on re-run");
    });

    // --- net worth --------------------------------------------------------
    await check("getNetWorth sums the latest balance per account", async () => {
      const nw = await getNetWorth(NOW);
      const a = nw.accounts.find((x) => x.accountId === accA.id);
      const b = nw.accounts.find((x) => x.accountId === accB.id);
      assert(a, "account A present");
      assertEqual(a.balance, "2000.00", "A latest balance (2026-06-01)");
      assertEqual(a.asOf, "2026-06-01", "A as-of date");
      assert(b, "account B present");
      assertEqual(b.balance, "750.00", "B latest balance (2026-06-10)");
      assert(/^-?\d+\.\d{2}$/.test(nw.total), `total is 2dp (${nw.total})`);
    });

    await check("getNetWorthHistory carries forward over an ascending axis", async () => {
      const hist = await getNetWorthHistory(12, NOW);
      assert(hist.points.length >= 3, "at least our snapshot dates appear");
      const dates = hist.points.map((p) => p.date);
      const sorted = [...dates].sort();
      assertEqual(JSON.stringify(dates), JSON.stringify(sorted), "axis ascending");
      const a = hist.accounts.find((x) => x.accountId === accA.id);
      assert(a, "account A series present");
      assertEqual(a.points.at(-1)?.amount, "2000.00", "A carried to its latest");
    });

    // --- MCP-backing read services ---------------------------------------
    await check("searchTransactions filters by query and amount", async () => {
      const rows = await searchTransactions({ query: runPrefix, minAmount: "-13.00", maxAmount: "0.00", limit: 100 });
      assert(rows.length >= 6, `found our flix/gym rows (got ${rows.length})`);
      assert(
        rows.every((r) => Number(r.amount) >= -13 && Number(r.amount) <= 0),
        "all within the amount bounds",
      );
    });

    await check("getSpendingSummary returns well-formed money strings", async () => {
      const s = await getSpendingSummary({ month: "2026-06" }, NOW);
      assertEqual(s.month, "2026-06", "month echoed");
      const money = /^-?\d+\.\d{2}$/;
      assert(money.test(s.income) && money.test(s.expenses) && money.test(s.net), "2dp money");
      assert(Number.isFinite(s.savingsRate), "savings rate finite");
    });
  } finally {
    await prisma.bankConnection.delete({ where: { id: connection.id } });
    await prisma.recurringSeries.deleteMany({
      where: { merchantKey: { startsWith: runPrefix } },
    });
  }

  console.log(`\n${passed} passed, ${failures.length} failed.`);
  if (failures.length > 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
