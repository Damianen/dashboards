// Pure budget pacing + alert-threshold logic. No DB, no I/O — table-driven
// tested (budget-pacing.test.ts). Money arrives as EUR numbers; threshold
// crossings compare in integer cents so 80%/100% are exact (no float drift).
// Month boundaries key off the Amsterdam calendar day (DST-stable: we count
// calendar days, never elapsed milliseconds).

import { DEFAULT_TIMEZONE, zonedDateString } from "@/lib/dates";

export type BudgetStatus = "under" | "on" | "over";

function ymd(now: Date, tz: string): { year: number; month: number; day: number } {
  const [year, month, day] = zonedDateString(now, tz).split("-").map(Number);
  return { year, month, day };
}

/** Calendar days (28..31) in `now`'s month, Amsterdam. */
export function daysInMonth(
  now: Date,
  tz: string = DEFAULT_TIMEZONE,
): number {
  const { year, month } = ymd(now, tz);
  // Day 0 of the next month is the last day of this one. Date.UTC is a pure
  // calendar calculation here — timezone-independent.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Fraction of the month elapsed by `now`, in (0, 1]: dayOfMonth / daysInMonth. */
export function monthElapsedFraction(
  now: Date,
  tz: string = DEFAULT_TIMEZONE,
): number {
  const { day } = ymd(now, tz);
  return day / daysInMonth(now, tz);
}

export interface BudgetProgress {
  spentFraction: number; // spentAbs / limit; 0 when limit<=0; may exceed 1
  paceFraction: number; // monthElapsedFraction(now)
  projected: number; // month-end projection: spentAbs / paceFraction; 0 if pace=0
  status: BudgetStatus;
}

/**
 * Pace a category's month-to-date spend against its limit.
 * `spentAbs` is the positive MTD spend (>= 0); `limit` the budget (EUR).
 * Guards limit<=0 → zeroed fractions, status "over" iff there is any spend.
 * status: "over" when spent >= limit; else "on" when spend is at/ahead of pace;
 * else "under".
 */
export function budgetProgress(
  spentAbs: number,
  limit: number,
  now: Date,
  tz: string = DEFAULT_TIMEZONE,
): BudgetProgress {
  const paceFraction = monthElapsedFraction(now, tz);
  if (limit <= 0) {
    return {
      spentFraction: 0,
      paceFraction,
      projected: 0,
      status: spentAbs > 0 ? "over" : "under",
    };
  }
  const spentFraction = spentAbs / limit;
  const projected = paceFraction > 0 ? spentAbs / paceFraction : 0;
  const status: BudgetStatus =
    spentFraction >= 1 ? "over" : spentFraction >= paceFraction ? "on" : "under";
  return { spentFraction, paceFraction, projected, status };
}

export type AlertThreshold = 80 | 100;

/**
 * Which alert thresholds the spend has reached, ascending. Integer-cents
 * comparison keeps 80%/100% exact. limit<=0 → [] (no budget to breach; the
 * large-transaction path handles unbudgeted spend).
 */
export function crossedThresholds(
  spentAbs: number,
  limit: number,
): AlertThreshold[] {
  if (limit <= 0) return [];
  const spentCents = Math.round(spentAbs * 100);
  const limitCents = Math.round(limit * 100);
  const out: AlertThreshold[] = [];
  if (spentCents * 100 >= 80 * limitCents) out.push(80);
  if (spentCents >= limitCents) out.push(100);
  return out;
}

/** "<budgetId>:<YYYY-MM>:<80|100>" — the NotificationLog dedupe key. */
export function budgetDedupeKey(
  budgetId: string,
  monthKey: string,
  threshold: AlertThreshold,
): string {
  return `${budgetId}:${monthKey}:${threshold}`;
}

/** Of `candidates`, those not already in `sent`. Order preserved. */
export function unsentKeys(
  candidates: string[],
  sent: Iterable<string>,
): string[] {
  const seen = new Set(sent);
  return candidates.filter((k) => !seen.has(k));
}
