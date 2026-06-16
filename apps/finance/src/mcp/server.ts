import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { getSpendingSummary } from "@/server/services/analytics";
import { listBudgetsWithProgress } from "@/server/services/budgets";
import { categorizeTransaction } from "@/server/services/categorize";
import { DomainError } from "@/server/services/errors";
import { getNetWorth } from "@/server/services/net-worth";
import { listSubscriptions } from "@/server/services/recurrence";
import { searchTransactions } from "@/server/services/transactions";

// Finance MCP server (root CLAUDE.md pattern). Tools are thin wrappers over
// src/server/services — no business logic here. Agent-facing args are snake_case
// and map to the services' camelCase inputs, which the services themselves
// validate against the canonical Zod schemas. Read tools + one write tool
// (categorize_transaction); no delete or bulk tools.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const SIGNED_AMOUNT = /^-?\d+(\.\d{1,2})?$/;

function ok(result: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(result) }] };
}

function fail(error: string, extra?: Record<string, unknown>): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify({ error, ...extra }) }],
    isError: true,
  };
}

/** Run a tool body, translating service errors into tool errors. Zod parse
 *  failures (services validate their own input) → invalid input; domain errors
 *  (incl. NotFoundError) → their message. */
async function run(fn: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    return ok(await fn());
  } catch (err) {
    if (err instanceof z.ZodError) {
      return fail("invalid input", { issues: err.flatten() });
    }
    if (err instanceof DomainError) return fail(err.message);
    console.error(err);
    return fail("internal error");
  }
}

/**
 * A fresh MCP server with every finance tool registered. All amounts follow the
 * bank sign convention (negative = outflow) and exclude internal transfers.
 */
export function buildServer(): McpServer {
  const server = new McpServer({ name: "finance", version: "0.1.0" });

  // ----- READ -----

  server.registerTool(
    "search_transactions",
    {
      description:
        "Search booked transactions. Text matches counterparty, description, or " +
        "merchant key (case-insensitive). Date and amount bounds are inclusive; " +
        "amounts are signed (negative = outflow). Internal transfers are excluded " +
        "unless include_internal is true. Newest first, capped at limit.",
      inputSchema: {
        query: z
          .string()
          .min(1)
          .max(200)
          .optional()
          .describe("Text to match against counterparty / description / merchant."),
        from: z
          .string()
          .regex(ISO_DATE)
          .optional()
          .describe("Earliest booking date YYYY-MM-DD (inclusive)."),
        to: z
          .string()
          .regex(ISO_DATE)
          .optional()
          .describe("Latest booking date YYYY-MM-DD (inclusive)."),
        category_id: z
          .string()
          .min(1)
          .optional()
          .describe("Restrict to one category id."),
        min_amount: z
          .string()
          .regex(SIGNED_AMOUNT)
          .optional()
          .describe("Minimum signed amount, e.g. '-50.00'."),
        max_amount: z
          .string()
          .regex(SIGNED_AMOUNT)
          .optional()
          .describe("Maximum signed amount, e.g. '0.00'."),
        include_internal: z
          .boolean()
          .optional()
          .describe("Include internal transfers (default false)."),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe("Max rows, 1–100 (default 50)."),
      },
    },
    ({
      query,
      from,
      to,
      category_id,
      min_amount,
      max_amount,
      include_internal,
      limit,
    }) =>
      run(() =>
        searchTransactions({
          query,
          from,
          to,
          categoryId: category_id,
          minAmount: min_amount,
          maxAmount: max_amount,
          includeInternal: include_internal,
          limit,
        }),
      ),
  );

  server.registerTool(
    "get_spending_summary",
    {
      description:
        "Income, expenses, net, savings rate, and spend-by-category for a civil " +
        "month (Europe/Amsterdam). Excludes internal transfers; expenses are " +
        "reported positive. Defaults to the current month.",
      inputSchema: {
        month: z
          .string()
          .regex(/^\d{4}-\d{2}$/)
          .optional()
          .describe("Civil month YYYY-MM. Defaults to the current month."),
      },
    },
    ({ month }) => run(() => getSpendingSummary({ month })),
  );

  server.registerTool(
    "get_budget_status",
    {
      description:
        "Current-month budgets with month-to-date spend and pacing: limit, spent, " +
        "projected month-end, and status (under | on | over). Excludes internal transfers.",
      inputSchema: {},
    },
    () => run(() => listBudgetsWithProgress()),
  );

  server.registerTool(
    "list_subscriptions",
    {
      description:
        "Active recurring subscriptions detected from transaction history: amount, " +
        "interval, next expected date, and monthly-equivalent cost, plus a total " +
        "monthly spend. Flags price increases (previousAmount set) and missed payments.",
      inputSchema: {},
    },
    () => run(() => listSubscriptions()),
  );

  server.registerTool(
    "get_net_worth",
    {
      description:
        "Current net worth: the summed latest balance across all accounts, plus " +
        "each account's latest balance and the date it was observed.",
      inputSchema: {},
    },
    () => run(() => getNetWorth()),
  );

  // ----- WRITE (the only mutating tool) -----

  server.registerTool(
    "categorize_transaction",
    {
      description:
        "Assign a category to one transaction (always wins over rules). With " +
        "create_rule, also create a contains-rule on its merchant so other " +
        "untriaged transactions of the same merchant get this category.",
      inputSchema: {
        transaction_id: z
          .string()
          .min(1)
          .describe("Id of the transaction to categorize."),
        category_id: z
          .string()
          .min(1)
          .describe("Id of the category to assign."),
        create_rule: z
          .boolean()
          .optional()
          .describe("Also create a merchant rule and apply it (default false)."),
      },
    },
    ({ transaction_id, category_id, create_rule }) =>
      run(() =>
        categorizeTransaction({
          transactionId: transaction_id,
          categoryId: category_id,
          createRule: create_rule,
        }),
      ),
  );

  return server;
}
