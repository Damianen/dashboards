// Pure helpers + wire shapes for the dashboard. Month bucketing keys off the
// booking date (a @db.Date, already Amsterdam-correct from ingest); these
// helpers only need to know which month "now" falls in. Aggregation itself
// happens in SQL — see src/server/services/analytics.ts.

import { DEFAULT_TIMEZONE, zonedDateString } from "@/lib/dates";

export interface DashboardSummary {
  month: string; // "YYYY-MM"
  income: string; // 2dp, positive
  expenses: string; // 2dp, positive
  net: string; // 2dp, signed (income - expenses)
  savingsRate: number; // net / income, 0 when income <= 0 (may be negative)
}

export interface CategorySpend {
  categoryId: string | null;
  name: string; // "Uncategorized" for the null bucket
  color: string;
  amount: string; // 2dp, positive spend
}

export interface TrendPoint {
  month: string; // "YYYY-MM"
  income: string; // 2dp
  expense: string; // 2dp
}

export interface DashboardData {
  summary: DashboardSummary;
  byCategory: CategorySpend[];
  trend: TrendPoint[];
}

export interface SpendingSummary {
  month: string; // "YYYY-MM"
  income: string; // 2dp, positive
  expenses: string; // 2dp, positive
  net: string; // 2dp, signed
  savingsRate: number;
  byCategory: CategorySpend[];
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function firstOfMonth(year: number, month: number): string {
  return `${year}-${pad(month)}-01`;
}

/** [start, nextStart) date bounds (YYYY-MM-DD) of `now`'s calendar month. */
export function monthRange(
  now: Date,
  timeZone: string = DEFAULT_TIMEZONE,
): { start: string; nextStart: string } {
  const [year, month] = zonedDateString(now, timeZone).split("-").map(Number);
  const next =
    month === 12 ? firstOfMonth(year + 1, 1) : firstOfMonth(year, month + 1);
  return { start: firstOfMonth(year, month), nextStart: next };
}

/** [start, nextStart) date bounds (YYYY-MM-DD) for an explicit "YYYY-MM" key. */
export function monthRangeFromKey(monthKey: string): {
  start: string;
  nextStart: string;
} {
  const [year, month] = monthKey.split("-").map(Number);
  const next =
    month === 12 ? firstOfMonth(year + 1, 1) : firstOfMonth(year, month + 1);
  return { start: firstOfMonth(year, month), nextStart: next };
}

/** The first-of-month dates (YYYY-MM-DD) for the last `n` months, ascending. */
export function lastNMonthStarts(
  now: Date,
  n: number,
  timeZone: string = DEFAULT_TIMEZONE,
): string[] {
  const [year, month] = zonedDateString(now, timeZone).split("-").map(Number);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    let y = year;
    let m = month - i;
    while (m <= 0) {
      m += 12;
      y -= 1;
    }
    out.push(firstOfMonth(y, m));
  }
  return out;
}

/** net / income, guarding income <= 0 → 0. Unit-independent (cents or euros). */
export function savingsRate(income: number, expense: number): number {
  if (income <= 0) return 0;
  return (income - expense) / income;
}

/** Left-join the requested month-starts against grouped rows, filling gaps. */
export function fillTrendMonths(
  starts: string[],
  rows: { month: string; income: string; expense: string }[],
): TrendPoint[] {
  const byMonth = new Map(rows.map((r) => [r.month.slice(0, 7), r]));
  return starts.map((start) => {
    const key = start.slice(0, 7);
    const found = byMonth.get(key);
    return {
      month: key,
      income: found?.income ?? "0.00",
      expense: found?.expense ?? "0.00",
    };
  });
}
