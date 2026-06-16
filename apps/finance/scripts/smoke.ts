// Fixture-driven sync smoke test, run against finance_dev only. Feeds synthetic
// Enable Banking JSON through the real map + upsert path and asserts the rows
// land, the run is idempotent, and exactly one balance snapshot is written.
// No live API, no real financial data (the repo is public).

import "dotenv/config";

import { Bank, ConnectionStatus } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import type { EbClient } from "@/server/services/enable-banking/client";
import type {
  EbBalance,
  EbTransaction,
} from "@/server/services/enable-banking/types";
import { syncConnection } from "@/server/services/sync";

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

// --- synthetic Enable Banking fixtures (obviously fake) --------------------

const FIXTURE_TX: EbTransaction[] = [
  {
    entry_reference: "SMOKE-1",
    booking_date: "2026-06-10",
    credit_debit_indicator: "DBIT",
    transaction_amount: { amount: "12.34", currency: "EUR" },
    creditor: { name: "Test Grocer" },
    remittance_information: ["weekly shop"],
    status: "BOOK",
  },
  {
    entry_reference: "SMOKE-2",
    booking_date: "2026-06-11",
    credit_debit_indicator: "CRDT",
    transaction_amount: { amount: "1000.00", currency: "EUR" },
    debtor: { name: "Test Payer" },
    remittance_information: ["salary"],
    status: "BOOK",
  },
  {
    // No stable id → externalId is the sha256 fallback.
    booking_date: "2026-06-12",
    credit_debit_indicator: "DBIT",
    transaction_amount: { amount: "3.50", currency: "EUR" },
    creditor: { name: "Test Cafe" },
    remittance_information: ["espresso"],
    status: "BOOK",
  },
];

const FIXTURE_BALANCES: EbBalance[] = [
  {
    balance_amount: { amount: "2500.00", currency: "EUR" },
    balance_type: "CLBD",
    reference_date: "2026-06-12",
  },
];

const notUsed = (name: string) => async (): Promise<never> => {
  throw new Error(`${name} not exercised by the smoke test`);
};

const fakeClient: EbClient = {
  listAspsps: notUsed("listAspsps"),
  startAuth: notUsed("startAuth"),
  createSession: notUsed("createSession"),
  getSession: notUsed("getSession"),
  getBalances: async () => ({ balances: FIXTURE_BALANCES }),
  getTransactions: async () => ({ transactions: FIXTURE_TX }),
};

// --- run -------------------------------------------------------------------

const runPrefix = `smoke-${Date.now()}`;

async function main(): Promise<void> {
  console.log(`Running finance sync smoke against "${dbName}"…`);

  const connection = await prisma.bankConnection.create({
    data: {
      bank: Bank.ING,
      aspspName: "Mock ASPSP",
      aspspCountry: "NL",
      state: `${runPrefix}-state`,
      status: ConnectionStatus.AUTHORIZED,
      authorizedAt: new Date(),
    },
  });
  const account = await prisma.account.create({
    data: {
      connectionId: connection.id,
      externalUid: `${runPrefix}-acc`,
      name: "Test Checking",
      currency: "EUR",
    },
  });

  const reload = () =>
    prisma.bankConnection.findUniqueOrThrow({
      where: { id: connection.id },
      include: { accounts: true },
    });

  const txCount = () =>
    prisma.transaction.count({ where: { accountId: account.id } });
  const snapCount = () =>
    prisma.balanceSnapshot.count({ where: { accountId: account.id } });

  try {
    // --- first sync: deep-history backfill -------------------------------
    const first = await syncConnection(await reload(), {
      client: fakeClient,
      now: new Date("2026-06-16T09:00:00Z"),
    });

    await check("first sync inserts all fixture rows", () => {
      assertEqual(first.length, 1, "one account result");
      assertEqual(first[0]!.inserted, FIXTURE_TX.length, "inserted count");
      assertEqual(first[0]!.fetched, FIXTURE_TX.length, "fetched count");
    });

    await check("rows are persisted", async () => {
      assertEqual(await txCount(), FIXTURE_TX.length, "transaction rows");
    });

    await check("signs follow the bank convention", async () => {
      const outflow = await prisma.transaction.findFirstOrThrow({
        where: { accountId: account.id, externalId: "SMOKE-1" },
      });
      const inflow = await prisma.transaction.findFirstOrThrow({
        where: { accountId: account.id, externalId: "SMOKE-2" },
      });
      assertEqual(outflow.amount.toFixed(2), "-12.34", "DBIT is negative");
      assertEqual(inflow.amount.toFixed(2), "1000.00", "CRDT is positive");
    });

    await check("no-stable-id row gets a sha256 externalId", async () => {
      const hashed = await prisma.transaction.findFirstOrThrow({
        where: { accountId: account.id, counterparty: "Test Cafe" },
      });
      assert(/^[0-9a-f]{64}$/.test(hashed.externalId), "64-hex externalId");
    });

    await check("one balance snapshot is written", async () => {
      assertEqual(await snapCount(), 1, "snapshot rows");
      assertEqual(first[0]!.balanceSnapshot, true, "snapshot flagged");
    });

    await check("first sync advances the cursor + initial backfill marker", async () => {
      const acc = await prisma.account.findUniqueOrThrow({
        where: { id: account.id },
      });
      assertEqual(
        acc.lastBookingDate?.toISOString().slice(0, 10),
        "2026-06-12",
        "lastBookingDate",
      );
      assert(acc.lastSyncedAt !== null, "lastSyncedAt set");
      const conn = await prisma.bankConnection.findUniqueOrThrow({
        where: { id: connection.id },
      });
      assert(conn.initialSyncAt !== null, "initialSyncAt set after first sync");
    });

    // --- second sync: same window must be a no-op ------------------------
    const second = await syncConnection(await reload(), {
      client: fakeClient,
      now: new Date("2026-06-16T15:00:00Z"),
    });

    await check("re-running a window is idempotent", async () => {
      assertEqual(second[0]!.inserted, 0, "0 new inserts on re-run");
      assertEqual(await txCount(), FIXTURE_TX.length, "no duplicate rows");
    });

    await check("balance snapshot stays one per account per day", async () => {
      assertEqual(await snapCount(), 1, "still one snapshot");
    });
  } finally {
    // Cascades to accounts → transactions + balance snapshots.
    await prisma.bankConnection.delete({ where: { id: connection.id } });
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
