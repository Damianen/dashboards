// End-to-end check for slice 2 (transfers, categorization, inbox, dashboard)
// against finance_dev only. Synthetic data, self-cleaning. No live API, no real
// financial data (the repo is public).

import "dotenv/config";

import {
  Bank,
  ConnectionStatus,
  CreditDebit,
  RuleField,
  RuleMatch,
} from "@/generated/prisma/client";
import { getDashboard } from "@/server/services/analytics";
import {
  categorizeNewTransactions,
  categorizeTransaction,
  rerunRulesOnUncategorized,
} from "@/server/services/categorize";
import { listInbox } from "@/server/services/inbox";
import { detectAndLinkTransfers } from "@/server/services/transfers";
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
const runPrefix = `verify-${Date.now()}`;
const RULE_VALUES = ["test grocer", "unknown shop", "cafe mystery"];

function day(d: string): Date {
  return new Date(`${d}T00:00:00.000Z`);
}

async function main(): Promise<void> {
  console.log(`Running finance slice-2 verify against "${dbName}"…`);

  const baseline = await prisma.transaction.count();
  const exact = baseline === 0;
  if (!exact) {
    console.log(
      `  note: ${baseline} pre-existing transactions — skipping exact dashboard totals.`,
    );
  }

  const cat = async (name: string) =>
    (await prisma.category.findUniqueOrThrow({ where: { name } })).id;
  const groceries = await cat("Groceries");
  const shopping = await cat("Shopping");
  const eatingOut = await cat("Eating out");

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
    data: { connectionId: connection.id, externalUid: `${runPrefix}-A`, name: "Checking", currency: "EUR" },
  });
  const accB = await prisma.account.create({
    data: { connectionId: connection.id, externalUid: `${runPrefix}-B`, name: "Savings", currency: "EUR" },
  });

  // Pre-existing rule so ingest categorizes the grocer.
  await prisma.categoryRule.create({
    data: {
      categoryId: groceries,
      field: RuleField.merchant,
      match: RuleMatch.contains,
      value: "test grocer",
      priority: 100,
    },
  });

  type Fix = {
    ref: string;
    accountId: string;
    amount: string;
    date: string;
    counterparty: string;
    currency?: string;
  };
  const fixtures: Fix[] = [
    // internal transfer pair (opposite, cross-account, 1 day apart, EUR)
    { ref: "tA", accountId: accA.id, amount: "-100.00", date: "2026-06-10", counterparty: "Savings Move" },
    { ref: "tB", accountId: accB.id, amount: "100.00", date: "2026-06-11", counterparty: "Savings Move" },
    // opposite amounts but different currency -> must NOT pair
    { ref: "tC", accountId: accA.id, amount: "-200.00", date: "2026-06-10", counterparty: "Fx Out" },
    { ref: "tD", accountId: accB.id, amount: "200.00", date: "2026-06-10", counterparty: "Fx In", currency: "USD" },
    // opposite EUR amounts but 4 days apart -> must NOT pair
    { ref: "tE", accountId: accA.id, amount: "-30.00", date: "2026-06-01", counterparty: "Far Out" },
    { ref: "tF", accountId: accB.id, amount: "30.00", date: "2026-06-05", counterparty: "Far In" },
    // categorized by rule at ingest
    { ref: "tG", accountId: accA.id, amount: "-45.00", date: "2026-06-12", counterparty: "Test Grocer" },
    // stays uncategorized -> inbox
    { ref: "tK", accountId: accA.id, amount: "-5.00", date: "2026-06-09", counterparty: "Random Vendor" },
    // manual + create-rule propagation (same merchantKey)
    { ref: "tI", accountId: accA.id, amount: "-12.00", date: "2026-06-13", counterparty: "Cafe Mystery" },
    { ref: "tJ", accountId: accA.id, amount: "-8.00", date: "2026-06-14", counterparty: "Cafe Mystery" },
    // manual-wins-over-rerun
    { ref: "tH", accountId: accA.id, amount: "-9.99", date: "2026-06-12", counterparty: "Unknown Shop" },
  ];

  const id: Record<string, string> = {};

  try {
    for (const f of fixtures) {
      const row = await prisma.transaction.create({
        data: {
          accountId: f.accountId,
          externalId: `${runPrefix}-${f.ref}`,
          bookingDate: day(f.date),
          amount: f.amount,
          currency: f.currency ?? "EUR",
          creditDebit: f.amount.startsWith("-") ? CreditDebit.DBIT : CreditDebit.CRDT,
          counterparty: f.counterparty,
        },
      });
      id[f.ref] = row.id;
    }

    // --- ingest enrichment: rules + merchantKey, then transfer pairing ---
    await categorizeNewTransactions();
    await detectAndLinkTransfers();

    const get = (ref: string) =>
      prisma.transaction.findUniqueOrThrow({ where: { id: id[ref] } });

    await check("opposite cross-account EUR pair within ±2 days is linked", async () => {
      const a = await get("tA");
      const b = await get("tB");
      assert(a.isInternalTransfer && b.isInternalTransfer, "both flagged");
      assert(a.transferPairId !== null, "tA has a pair id");
      assertEqual(a.transferPairId, b.transferPairId, "shared transferPairId");
    });

    await check("currency mismatch does not pair", async () => {
      const c = await get("tC");
      const d = await get("tD");
      assert(!c.isInternalTransfer && !d.isInternalTransfer, "tC/tD not flagged");
    });

    await check("opposite amounts >2 days apart do not pair", async () => {
      const e = await get("tE");
      const f = await get("tF");
      assert(!e.isInternalTransfer && !f.isInternalTransfer, "tE/tF not flagged");
    });

    await check("rule categorizes at ingest and computes merchantKey", async () => {
      const g = await get("tG");
      assertEqual(g.categoryId, groceries, "tG -> Groceries");
      assertEqual(g.merchantKey, "test grocer", "tG merchantKey normalized");
    });

    await check("inbox holds only uncategorized non-transfer rows", async () => {
      const page = await listInbox({ limit: 100 });
      const ids = new Set(page.items.map((i) => i.id));
      assert(!ids.has(id.tA) && !ids.has(id.tB), "transfers excluded");
      assert(!ids.has(id.tG), "categorized excluded");
      assert(ids.has(id.tK), "uncategorized tK present");
    });

    await check("manual categorization wins and survives a rule re-run", async () => {
      await categorizeTransaction({ transactionId: id.tH, categoryId: shopping });
      assertEqual((await get("tH")).categoryId, shopping, "tH set to Shopping");
      // A rule that WOULD match tH now exists, but tH is no longer uncategorized.
      await prisma.categoryRule.create({
        data: {
          categoryId: groceries,
          field: RuleField.merchant,
          match: RuleMatch.contains,
          value: "unknown shop",
          priority: 100,
        },
      });
      await rerunRulesOnUncategorized();
      assertEqual((await get("tH")).categoryId, shopping, "manual not overwritten");
    });

    await check("create-rule propagates to other rows of the same merchant", async () => {
      const res = await categorizeTransaction({
        transactionId: id.tI,
        categoryId: eatingOut,
        createRule: true,
      });
      assertEqual(res.ruleCreated, true, "rule created");
      assert(res.alsoCategorized >= 1, "at least one sibling categorized");
      assertEqual((await get("tI")).categoryId, eatingOut, "tI -> Eating out");
      assertEqual((await get("tJ")).categoryId, eatingOut, "tJ -> Eating out (propagated)");
    });

    // --- dashboard ------------------------------------------------------
    const dash = await getDashboard(NOW);

    await check("dashboard shapes are correct", () => {
      assertEqual(dash.trend.length, 6, "six trend months");
      const money = /^-?\d+\.\d{2}$/;
      assert(money.test(dash.summary.income), `income is 2dp string: ${dash.summary.income}`);
      assert(money.test(dash.summary.expenses), `expenses is 2dp string: ${dash.summary.expenses}`);
      assert(money.test(dash.summary.net), `net is 2dp string: ${dash.summary.net}`);
      assert(typeof dash.summary.savingsRate === "number" && Number.isFinite(dash.summary.savingsRate), "savingsRate is a finite number");
      for (const p of dash.trend) {
        assert(money.test(p.income) && money.test(p.expense), "trend points are 2dp strings");
      }
    });

    if (exact) {
      await check("dashboard excludes transfers and totals June correctly", () => {
        // income: tD 200 + tF 30 = 230 (tB +100 transfer excluded)
        assertEqual(dash.summary.income, "230.00", "income excludes transfer");
        // expenses: 200+30+45+5+12+8+9.99 = 309.99 (tA -100 transfer excluded)
        assertEqual(dash.summary.expenses, "309.99", "expenses exclude transfer");
        assertEqual(dash.summary.net, "-79.99", "net = income - expenses");
        const byName = new Map(dash.byCategory.map((c) => [c.name, c.amount]));
        assertEqual(byName.get("Groceries"), "45.00", "Groceries bucket");
        assertEqual(byName.get("Eating out"), "20.00", "Eating out bucket (12+8)");
        assertEqual(byName.get("Shopping"), "9.99", "Shopping bucket");
        assertEqual(byName.get("Uncategorized"), "235.00", "Uncategorized bucket (200+30+5)");
      });
    }

    await check("detection is idempotent on a second run", async () => {
      const again = await detectAndLinkTransfers();
      assertEqual(again.pairs, 0, "no new pairs on re-run");
    });
  } finally {
    await prisma.bankConnection.delete({ where: { id: connection.id } });
    await prisma.categoryRule.deleteMany({ where: { value: { in: RULE_VALUES } } });
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
