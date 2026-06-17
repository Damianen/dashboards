import { Prisma } from "@/generated/prisma/client";
import {
  fillTrendMonths,
  lastNMonthStarts,
  monthRange,
  monthRangeFromKey,
  savingsRate,
  type CategorySpend,
  type DashboardData,
  type SpendingSummary,
  type TrendPoint,
} from "@/lib/analytics";
import { DEFAULT_TIMEZONE } from "@/lib/dates";
import { spendingSummarySchema, type SpendingSummaryInput } from "@/lib/schemas";
import { prisma } from "@/server/db";

// Dashboard aggregation. ALL maths happens in SQL (the React layer only
// formats). Every aggregate excludes internal transfers and buckets by booking
// date (a @db.Date, already Amsterdam-correct). The pg adapter returns NUMERIC
// columns as Decimal/string; `toMoney` coerces either to a signed 2dp string.

const TREND_MONTHS = 6;

function toMoney(value: unknown): string {
  return new Prisma.Decimal(String(value ?? 0)).toFixed(2);
}

function toCents(value: unknown): number {
  return new Prisma.Decimal(String(value ?? 0)).times(100).toNumber();
}

// --- shared aggregations (reused by the dashboard AND the MCP summary tool) ---

/** Income / expense (expense reported positive) for a [start, nextStart) window. */
async function monthTotals(
  start: string,
  nextStart: string,
): Promise<{ income: string; expense: string }> {
  const [row] = await prisma.$queryRaw<
    Array<{ income: string; expense: string }>
  >(Prisma.sql`
    SELECT
      COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0)::numeric(14,2) AS income,
      COALESCE(SUM(CASE WHEN amount < 0 THEN -amount ELSE 0 END), 0)::numeric(14,2) AS expense
    FROM "Transaction"
    WHERE "isInternalTransfer" = false
      AND "bookingDate" >= ${start}::date
      AND "bookingDate" <  ${nextStart}::date
  `);
  return { income: String(row?.income ?? 0), expense: String(row?.expense ?? 0) };
}

/** Spend by category (expenses only) for a window. NULL category -> Uncategorized. */
async function categorySpend(
  start: string,
  nextStart: string,
): Promise<CategorySpend[]> {
  const rows = await prisma.$queryRaw<
    Array<{
      categoryId: string | null;
      name: string | null;
      color: string | null;
      spend: string;
    }>
  >(Prisma.sql`
    SELECT t."categoryId" AS "categoryId", c.name AS name, c.color AS color,
           SUM(-t.amount)::numeric(14,2) AS spend
    FROM "Transaction" t
    LEFT JOIN "Category" c ON c.id = t."categoryId"
    WHERE t."isInternalTransfer" = false
      AND t.amount < 0
      AND t."bookingDate" >= ${start}::date
      AND t."bookingDate" <  ${nextStart}::date
    GROUP BY t."categoryId", c.name, c.color
    ORDER BY spend DESC
  `);
  return rows.map((r) => ({
    categoryId: r.categoryId,
    name: r.name ?? "Uncategorized",
    color: r.color ?? "#808080",
    amount: toMoney(r.spend),
  }));
}

/** Assemble the income/expense/net/savingsRate block shared by both callers. */
function summaryBlock(
  monthKey: string,
  totals: { income: string; expense: string },
) {
  const income = toMoney(totals.income);
  const expenses = toMoney(totals.expense);
  return {
    month: monthKey,
    income,
    expenses,
    net: new Prisma.Decimal(income).minus(expenses).toFixed(2),
    savingsRate: savingsRate(toCents(totals.income), toCents(totals.expense)),
  };
}

export async function getDashboard(
  now: Date = new Date(),
  timeZone: string = DEFAULT_TIMEZONE,
): Promise<DashboardData> {
  const { start, nextStart } = monthRange(now, timeZone);
  const trendStarts = lastNMonthStarts(now, TREND_MONTHS, timeZone);
  const trendFrom = trendStarts[0];

  const [totals, byCategory] = await Promise.all([
    monthTotals(start, nextStart),
    categorySpend(start, nextStart),
  ]);

  // 6-month income-vs-expense trend, bucketed by month of the booking date.
  const trendRows = await prisma.$queryRaw<
    Array<{ month: Date; income: string; expense: string }>
  >(Prisma.sql`
    SELECT date_trunc('month', "bookingDate")::date AS month,
           COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0)::numeric(14,2) AS income,
           COALESCE(SUM(CASE WHEN amount < 0 THEN -amount ELSE 0 END), 0)::numeric(14,2) AS expense
    FROM "Transaction"
    WHERE "isInternalTransfer" = false
      AND "bookingDate" >= ${trendFrom}::date
      AND "bookingDate" <  ${nextStart}::date
    GROUP BY 1
    ORDER BY 1
  `);

  const trend: TrendPoint[] = fillTrendMonths(
    trendStarts,
    trendRows.map((r) => ({
      month:
        r.month instanceof Date
          ? r.month.toISOString().slice(0, 10)
          : String(r.month),
      income: toMoney(r.income),
      expense: toMoney(r.expense),
    })),
  );

  return { summary: summaryBlock(start.slice(0, 7), totals), byCategory, trend };
}

/**
 * Income / expenses / net / savings-rate + by-category spend for one month
 * (defaults to the current one). Backs the MCP get_spending_summary tool.
 */
export async function getSpendingSummary(
  input: SpendingSummaryInput = {},
  now: Date = new Date(),
  timeZone: string = DEFAULT_TIMEZONE,
): Promise<SpendingSummary> {
  const { month } = spendingSummarySchema.parse(input);
  const { start, nextStart } = month
    ? monthRangeFromKey(month)
    : monthRange(now, timeZone);

  const [totals, byCategory] = await Promise.all([
    monthTotals(start, nextStart),
    categorySpend(start, nextStart),
  ]);

  return { ...summaryBlock(start.slice(0, 7), totals), byCategory };
}
