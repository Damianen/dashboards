import { Prisma } from "@/generated/prisma/client";
import { lastNMonthStarts, monthRange } from "@/lib/analytics";
import { budgetProgress } from "@/lib/budget-pacing";
import type { BudgetsResponse, BudgetView } from "@/lib/budgets";
import {
  DEFAULT_TIMEZONE,
  addDaysToDayStart,
  zonedDateString,
  zonedDayStart,
} from "@/lib/dates";
import {
  budgetDeleteSchema,
  budgetUpsertSchema,
  type BudgetDeleteInput,
  type BudgetUpsertInput,
} from "@/lib/schemas";
import { prisma } from "@/server/db";

// Budget CRUD + month-to-date pacing. The MTD spend aggregation mirrors the
// dashboard's SQL shape (analytics.ts): signed amounts, expenses only, internal
// transfers excluded, bucketed by booking date — but bounded at *today* (MTD),
// not the month end. Pacing/threshold maths live in the pure budget-pacing
// module; this layer only loads rows and persists.

/** UTC-midnight Date for a "YYYY-MM-01" month-start (matches Budget.month). */
function firstOfMonthDate(start: string): Date {
  return new Date(`${start}T00:00:00.000Z`);
}

/** Exclusive MTD upper bound: local midnight tomorrow, so today is included. */
function mtdUpperBound(now: Date, tz: string): string {
  return zonedDateString(addDaysToDayStart(zonedDayStart(now, tz), 1, tz), tz);
}

/** Positive month-to-date spend per category (categorized expenses only). */
async function mtdSpendByCategory(
  now: Date,
  tz: string,
): Promise<Map<string, string>> {
  const { start } = monthRange(now, tz);
  const upper = mtdUpperBound(now, tz);
  const rows = await prisma.$queryRaw<
    Array<{ categoryId: string; spend: string }>
  >(Prisma.sql`
    SELECT t."categoryId" AS "categoryId", SUM(-t.amount)::numeric(14,2) AS spend
    FROM "Transaction" t
    WHERE t."isInternalTransfer" = false
      AND t.amount < 0
      AND t."categoryId" IS NOT NULL
      AND t."bookingDate" >= ${start}::date
      AND t."bookingDate" <  ${upper}::date
    GROUP BY t."categoryId"
  `);
  return new Map(
    rows.map((r) => [
      r.categoryId,
      new Prisma.Decimal(String(r.spend ?? 0)).toFixed(2),
    ]),
  );
}

/** Current-month budgets, each decorated with MTD spend + pacing. */
export async function listBudgetsWithProgress(
  now: Date = new Date(),
  tz: string = DEFAULT_TIMEZONE,
): Promise<BudgetsResponse> {
  const { start } = monthRange(now, tz);
  const monthKey = start.slice(0, 7);
  const monthDate = firstOfMonthDate(start);

  const [budgets, spend] = await Promise.all([
    prisma.budget.findMany({
      where: { month: monthDate },
      include: { category: { select: { name: true, color: true } } },
      orderBy: { category: { name: "asc" } },
    }),
    mtdSpendByCategory(now, tz),
  ]);

  const views: BudgetView[] = budgets.map((b) => {
    const spent = spend.get(b.categoryId) ?? "0.00";
    const p = budgetProgress(Number(spent), b.limit.toNumber(), now, tz);
    return {
      id: b.id,
      categoryId: b.categoryId,
      categoryName: b.category.name,
      categoryColor: b.category.color,
      month: monthKey,
      limit: b.limit.toFixed(2),
      spent,
      spentFraction: p.spentFraction,
      paceFraction: p.paceFraction,
      projected: p.projected.toFixed(2),
      status: p.status,
    };
  });

  return { month: monthKey, budgets: views };
}

/** Create or update the current month's limit for a category. */
export async function upsertBudget(
  input: BudgetUpsertInput,
  now: Date = new Date(),
  tz: string = DEFAULT_TIMEZONE,
): Promise<void> {
  const data = budgetUpsertSchema.parse(input);
  const { start } = monthRange(now, tz);
  const monthDate = firstOfMonthDate(start);
  const limit = new Prisma.Decimal(data.limit);
  await prisma.budget.upsert({
    where: { categoryId_month: { categoryId: data.categoryId, month: monthDate } },
    update: { limit },
    create: { categoryId: data.categoryId, month: monthDate, limit },
  });
}

export async function deleteBudget(input: BudgetDeleteInput): Promise<void> {
  const data = budgetDeleteSchema.parse(input);
  await prisma.budget.delete({ where: { id: data.id } });
}

/**
 * Carry last month's limits into the current month, skipping categories that
 * already have a budget this month. Returns how many were copied.
 */
export async function copyLastMonthBudgets(
  now: Date = new Date(),
  tz: string = DEFAULT_TIMEZONE,
): Promise<{ copied: number }> {
  const [lastStart, thisStart] = lastNMonthStarts(now, 2, tz);
  const lastDate = firstOfMonthDate(lastStart);
  const thisDate = firstOfMonthDate(thisStart);

  const [lastBudgets, thisBudgets] = await Promise.all([
    prisma.budget.findMany({ where: { month: lastDate } }),
    prisma.budget.findMany({
      where: { month: thisDate },
      select: { categoryId: true },
    }),
  ]);

  const have = new Set(thisBudgets.map((b) => b.categoryId));
  const toCreate = lastBudgets.filter((b) => !have.has(b.categoryId));
  if (toCreate.length === 0) return { copied: 0 };

  const res = await prisma.budget.createMany({
    data: toCreate.map((b) => ({
      categoryId: b.categoryId,
      month: thisDate,
      limit: b.limit,
    })),
    skipDuplicates: true,
  });
  return { copied: res.count };
}
