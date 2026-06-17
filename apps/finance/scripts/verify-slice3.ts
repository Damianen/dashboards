// End-to-end check for slice 3 (budgets, nightly notifications, sync health)
// against finance_dev only. Synthetic data, self-cleaning. No live ntfy (a
// capturing send is injected), no real financial data (the repo is public).

import "dotenv/config";

import { Bank, ConnectionStatus, CreditDebit } from "@/generated/prisma/client";
import { budgetDedupeKey } from "@/lib/budget-pacing";
import { runNightlyNotifications } from "@/server/services/notifications";
import type { NtfyPayload } from "@/server/services/ntfy";
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

const NOW = new Date("2026-06-16T09:00:00Z"); // Amsterdam: 2026-06-16
const runPrefix = `verify3-${Date.now()}`;
const catName = `${runPrefix}-cat`;

function day(d: string): Date {
  return new Date(`${d}T00:00:00.000Z`);
}

async function main(): Promise<void> {
  console.log(`Running finance slice-3 verify against "${dbName}"…`);

  const category = await prisma.category.create({
    data: { name: catName, kind: "expense", color: "#123456" },
  });
  const connection = await prisma.bankConnection.create({
    data: {
      bank: Bank.ING,
      aspspName: "Mock ASPSP",
      aspspCountry: "NL",
      state: `${runPrefix}-state`,
      status: ConnectionStatus.AUTHORIZED,
      authorizedAt: NOW,
      validUntil: day("2026-12-01"), // far out → no sync-health alert
      lastSyncedAt: NOW,
      consecutiveFailures: 0,
    },
  });
  const account = await prisma.account.create({
    data: {
      connectionId: connection.id,
      externalUid: `${runPrefix}-A`,
      name: "Checking",
      currency: "EUR",
    },
  });

  const budget = await prisma.budget.create({
    data: { categoryId: category.id, month: day("2026-06-01"), limit: "300.00" },
  });

  // -312 this month → budget 80% + 100% AND large (>250). Internal transfer and
  // an old large outflow must NOT alert.
  const big = await prisma.transaction.create({
    data: {
      accountId: account.id,
      externalId: `${runPrefix}-big`,
      bookingDate: day("2026-06-15"),
      amount: "-312.00",
      creditDebit: CreditDebit.DBIT,
      counterparty: "Big Spend",
      categoryId: category.id,
    },
  });
  await prisma.transaction.create({
    data: {
      accountId: account.id,
      externalId: `${runPrefix}-xfer`,
      bookingDate: day("2026-06-15"),
      amount: "-999.00",
      creditDebit: CreditDebit.DBIT,
      counterparty: "Internal Move",
      categoryId: category.id,
      isInternalTransfer: true,
    },
  });
  await prisma.transaction.create({
    data: {
      accountId: account.id,
      externalId: `${runPrefix}-old`,
      bookingDate: day("2026-01-10"), // outside the recent large-txn window
      amount: "-999.00",
      creditDebit: CreditDebit.DBIT,
      counterparty: "Old Big",
      categoryId: category.id,
    },
  });

  const ourKeys = [
    budgetDedupeKey(budget.id, "2026-06", 80),
    budgetDedupeKey(budget.id, "2026-06", 100),
    `large_txn:${big.id}`,
  ];

  // Only our category's alerts — isolates us from any real data in finance_dev.
  const captured: NtfyPayload[] = [];
  const mine = () => captured.filter((p) => p.message.includes(catName));
  const capture = async (p: NtfyPayload) => {
    captured.push(p);
  };
  const throwing = async () => {
    throw new Error("ntfy unavailable");
  };

  try {
    // Phase 1: a failing send must claim then RELEASE the dedupe keys.
    captured.length = 0;
    await runNightlyNotifications({ now: NOW, send: throwing });
    await check("failed send leaves no NotificationLog rows (re-arms)", async () => {
      const rows = await prisma.notificationLog.count({
        where: { dedupeKey: { in: ourKeys } },
      });
      assertEqual(rows, 0, "no dedupe rows persisted after a failed send");
    });

    // Phase 2: a successful run fires every alert exactly once.
    captured.length = 0;
    const first = await runNightlyNotifications({ now: NOW, send: capture });
    await check("budget crosses 80% and 100% (two alerts)", () => {
      assertEqual(first.budgetAlerts, 2, "two budget alerts");
      const titles = mine()
        .map((p) => p.title)
        .sort();
      assert(
        titles.some((t) => t.includes("80%")) && titles.some((t) => t.includes("100%")),
        `80% and 100% titles present: ${titles.join(", ")}`,
      );
    });
    await check("large transaction above threshold alerts once", () => {
      assertEqual(first.largeTxnAlerts, 1, "one large-txn alert");
      const large = captured.filter((p) => p.title.startsWith("Large transaction"));
      assert(
        large.some((p) => p.title.includes("312.00")),
        "the €312 outflow is reported",
      );
    });
    await check("internal transfer and old outflow do NOT alert", () => {
      assert(
        !captured.some((p) => p.message.includes("999")),
        "no €999 alert (transfer excluded, old txn outside window)",
      );
      assertEqual(mine().length, 3, "exactly our 3 alerts captured");
    });
    await check("healthy connection raises no sync-health alert", () => {
      // Other real connections in finance_dev may legitimately alert; assert
      // only that OUR healthy connection contributed none.
      assert(
        !mine().some((p) => p.title.startsWith("Reconnect")),
        "our connection needs no re-consent",
      );
    });

    // Phase 3: a second run is fully deduplicated.
    captured.length = 0;
    const second = await runNightlyNotifications({ now: NOW, send: capture });
    await check("second run is deduplicated", () => {
      assertEqual(second.budgetAlerts, 0, "no repeat budget alerts");
      assertEqual(second.largeTxnAlerts, 0, "no repeat large-txn alerts");
      assertEqual(mine().length, 0, "nothing re-sent for our category");
    });
  } finally {
    await prisma.notificationLog.deleteMany({ where: { dedupeKey: { in: ourKeys } } });
    await prisma.bankConnection.delete({ where: { id: connection.id } });
    await prisma.budget.deleteMany({ where: { categoryId: category.id } });
    await prisma.category.delete({ where: { id: category.id } });
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
