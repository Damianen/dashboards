import { Prisma } from "@/generated/prisma/client";
import {
  fillTrendMonths,
  lastNMonthStarts,
  monthRange,
  savingsRate,
  type CategorySpend,
  type DashboardData,
  type TrendPoint,
} from "@/lib/analytics";
import { DEFAULT_TIMEZONE } from "@/lib/dates";
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

export async function getDashboard(
  now: Date = new Date(),
  timeZone: string = DEFAULT_TIMEZONE,
): Promise<DashboardData> {
  const { start, nextStart } = monthRange(now, timeZone);
  const trendStarts = lastNMonthStarts(now, TREND_MONTHS, timeZone);
  const trendFrom = trendStarts[0];

  // 1. Current-month income / expense (expense is reported positive).
  const [summaryRow] = await prisma.$queryRaw<
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

  // 2. Spend by category this month (expenses only). NULL category -> Uncategorized.
  const categoryRows = await prisma.$queryRaw<
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

  // 3. 6-month income-vs-expense trend, bucketed by month of the booking date.
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

  const income = toMoney(summaryRow?.income);
  const expenses = toMoney(summaryRow?.expense);
  const summary = {
    month: start.slice(0, 7),
    income,
    expenses,
    net: new Prisma.Decimal(income).minus(expenses).toFixed(2),
    savingsRate: savingsRate(
      toCents(summaryRow?.income),
      toCents(summaryRow?.expense),
    ),
  };

  const byCategory: CategorySpend[] = categoryRows.map((r) => ({
    categoryId: r.categoryId,
    name: r.name ?? "Uncategorized",
    color: r.color ?? "#808080",
    amount: toMoney(r.spend),
  }));

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

  return { summary, byCategory, trend };
}
