import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the service layer so the tools are exercised in isolation (no DB). We
// assert each tool returns its service's result verbatim and maps snake_case
// args → the services' camelCase inputs. errors.ts is NOT mocked — run() relies
// on the real DomainError for its instanceof check.
vi.mock("@/server/services/analytics", () => ({ getSpendingSummary: vi.fn() }));
vi.mock("@/server/services/budgets", () => ({
  listBudgetsWithProgress: vi.fn(),
}));
vi.mock("@/server/services/categorize", () => ({
  categorizeTransaction: vi.fn(),
}));
vi.mock("@/server/services/net-worth", () => ({ getNetWorth: vi.fn() }));
vi.mock("@/server/services/recurrence", () => ({ listSubscriptions: vi.fn() }));
vi.mock("@/server/services/transactions", () => ({ searchTransactions: vi.fn() }));

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { getSpendingSummary } from "@/server/services/analytics";
import { listBudgetsWithProgress } from "@/server/services/budgets";
import { categorizeTransaction } from "@/server/services/categorize";
import { getNetWorth } from "@/server/services/net-worth";
import { listSubscriptions } from "@/server/services/recurrence";
import { searchTransactions } from "@/server/services/transactions";

import { buildServer } from "./server";

let client: Client;
let server: ReturnType<typeof buildServer>;

beforeEach(async () => {
  vi.clearAllMocks();
  server = buildServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "test", version: "0.0.0" });
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
});

afterEach(async () => {
  await client.close();
  await server.close();
});

async function call(name: string, args: Record<string, unknown> = {}) {
  const res = await client.callTool({ name, arguments: args });
  const content = res.content as Array<{ type: string; text: string }>;
  return { isError: res.isError === true, data: JSON.parse(content[0].text) };
}

describe("finance MCP tools (happy paths)", () => {
  it("lists exactly the six tools", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "categorize_transaction",
      "get_budget_status",
      "get_net_worth",
      "get_spending_summary",
      "list_subscriptions",
      "search_transactions",
    ]);
  });

  it("search_transactions returns the service result and maps args", async () => {
    const items = [
      {
        id: "t1",
        bookingDate: "2026-06-01",
        amount: "-9.99",
        currency: "EUR",
        counterparty: "Netflix",
        descriptionRaw: null,
        bank: "ING",
        accountName: "Checking",
      },
    ];
    vi.mocked(searchTransactions).mockResolvedValue(items);

    const { isError, data } = await call("search_transactions", {
      query: "netflix",
      from: "2026-01-01",
      limit: 10,
    });

    expect(isError).toBe(false);
    expect(data).toEqual(items);
    expect(searchTransactions).toHaveBeenCalledWith(
      expect.objectContaining({ query: "netflix", from: "2026-01-01", limit: 10 }),
    );
  });

  it("get_spending_summary forwards the month", async () => {
    const summary = {
      month: "2026-06",
      income: "3000.00",
      expenses: "1200.00",
      net: "1800.00",
      savingsRate: 0.6,
      byCategory: [],
    };
    vi.mocked(getSpendingSummary).mockResolvedValue(summary);

    const { isError, data } = await call("get_spending_summary", {
      month: "2026-06",
    });

    expect(isError).toBe(false);
    expect(data).toEqual(summary);
    expect(getSpendingSummary).toHaveBeenCalledWith({ month: "2026-06" });
  });

  it("get_budget_status returns budget pacing", async () => {
    const budgets = { month: "2026-06", budgets: [] };
    vi.mocked(listBudgetsWithProgress).mockResolvedValue(budgets);

    const { isError, data } = await call("get_budget_status");

    expect(isError).toBe(false);
    expect(data).toEqual(budgets);
  });

  it("list_subscriptions returns active series", async () => {
    const subs = {
      monthlyTotal: "9.99",
      currency: "EUR",
      subscriptions: [
        {
          id: "s1",
          name: "Netflix",
          merchantKey: "netflix",
          amount: "9.99",
          intervalDays: 30,
          intervalLabel: "Monthly",
          nextExpected: "2026-07-01",
          monthlyEquivalent: "10.14",
          missed: false,
          priceIncreased: true,
          previousAmount: "7.99",
        },
      ],
    };
    vi.mocked(listSubscriptions).mockResolvedValue(subs);

    const { isError, data } = await call("list_subscriptions");

    expect(isError).toBe(false);
    expect(data).toEqual(subs);
  });

  it("get_net_worth returns total and per-account balances", async () => {
    const nw = {
      asOf: "2026-06-15",
      currency: "EUR",
      total: "12345.67",
      accounts: [
        {
          accountId: "a",
          name: "ING Checking",
          bank: "ING",
          balance: "12345.67",
          asOf: "2026-06-15",
        },
      ],
    };
    vi.mocked(getNetWorth).mockResolvedValue(nw);

    const { isError, data } = await call("get_net_worth");

    expect(isError).toBe(false);
    expect(data).toEqual(nw);
  });

  it("categorize_transaction (write) maps args and returns the result", async () => {
    const result = {
      id: "t1",
      categoryId: "c1",
      ruleCreated: true,
      alsoCategorized: 3,
    };
    vi.mocked(categorizeTransaction).mockResolvedValue(result);

    const { isError, data } = await call("categorize_transaction", {
      transaction_id: "t1",
      category_id: "c1",
      create_rule: true,
    });

    expect(isError).toBe(false);
    expect(data).toEqual(result);
    expect(categorizeTransaction).toHaveBeenCalledWith({
      transactionId: "t1",
      categoryId: "c1",
      createRule: true,
    });
  });
});
