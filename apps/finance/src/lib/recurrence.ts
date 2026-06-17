// Recurring-series detection — the apps/finance/CLAUDE.md rule, as pure,
// table-tested functions (no DB, no clock except a `now` passed in). Money is
// integer cents; days are whole calendar days. The service layer
// (src/server/services/recurrence.ts) groups a merchant's expenses, converts
// Decimal → cents, and calls detectRecurrence; persistence/formatting live there.
//
// The rule: group expenses by merchantKey; a series exists when intervals
// cluster near 7/30/90/365 days (±3) and amounts stay within ±10%. We treat the
// *recent* amounts as the current price and flag an earlier, materially lower
// level as a price increase. Annual (365) is supported but won't fire with only
// ~12 months of backfill (one occurrence ⇒ no interval); weekly/monthly/
// quarterly all detect comfortably.

import { DEFAULT_TIMEZONE, zonedDateString } from "@/lib/dates";

export const CANONICAL_INTERVALS = [7, 30, 90, 365] as const;
export const TOLERANCE_DAYS = 3;
export const AMOUNT_TOLERANCE = 0.1; // ±10%
export const MIN_OCCURRENCES = 3; // ≥2 intervals so "cluster" is meaningful
export const RECENT_WINDOW = 3; // occurrences defining the current price

const DAY_MS = 86_400_000;
const AVG_DAYS_PER_MONTH = 365 / 12;

export interface Occurrence {
  /** A @db.Date value (UTC-midnight calendar day). */
  date: Date;
  /** Signed integer cents — bank convention (expense = negative). */
  amountCents: number;
}

export interface RecurrenceResult {
  intervalDays: number; // canonical 7 | 30 | 90 | 365
  expectedAmountCents: number; // signed current price (negative for an expense)
  /** Signed prior price iff a >10% increase was detected; null otherwise. */
  previousAmountCents: number | null;
  lastSeenDate: Date;
  occurrenceCount: number;
}

export interface SubscriptionState {
  active: boolean;
  missed: boolean;
}

/** Median of a numeric list (0 for empty). Even length → mean of the middle two. */
export function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/** The canonical interval nearest `days` (ties resolve to the smaller). */
function nearestCanonical(days: number): number {
  let best: number = CANONICAL_INTERVALS[0];
  let bestDelta = Infinity;
  for (const c of CANONICAL_INTERVALS) {
    const d = Math.abs(days - c);
    if (d < bestDelta) {
      bestDelta = d;
      best = c;
    }
  }
  return best;
}

/** Whole-day difference between two @db.Date values (UTC-midnight, DST-free). */
function dayDiff(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / DAY_MS);
}

/**
 * Detect a recurring series from one merchant's occurrences, or null. Pure.
 * Requires ≥ MIN_OCCURRENCES, a median gap within ±TOLERANCE_DAYS of a canonical
 * interval, a majority of gaps clustered around it (a lone ~2× gap is a tolerated
 * missed payment), and a stable recent-price window.
 */
export function detectRecurrence(
  occurrences: Occurrence[],
): RecurrenceResult | null {
  if (occurrences.length < MIN_OCCURRENCES) return null;

  const sorted = [...occurrences].sort(
    (a, b) => a.date.getTime() - b.date.getTime(),
  );

  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    gaps.push(dayDiff(sorted[i - 1].date, sorted[i].date));
  }

  const intervalDays = nearestCanonical(median(gaps));
  if (Math.abs(median(gaps) - intervalDays) > TOLERANCE_DAYS) return null;

  // Cluster: at least half the gaps within ±tolerance of the interval.
  const clustered = gaps.filter(
    (g) => Math.abs(g - intervalDays) <= TOLERANCE_DAYS,
  ).length;
  if (clustered * 2 < gaps.length) return null;

  // Amounts as positive magnitudes, in date order.
  const mags = sorted.map((o) => Math.abs(o.amountCents));
  const expectedMag = Math.round(median(mags.slice(-RECENT_WINDOW)));

  // The current price must itself be stable within ±10%.
  const recentStable = mags
    .slice(-RECENT_WINDOW)
    .every((m) => Math.abs(m - expectedMag) <= expectedMag * AMOUNT_TOLERANCE);
  if (!recentStable) return null;

  // Price increase: the earliest stable level is materially below the current.
  const earliestMag = Math.round(median(mags.slice(0, RECENT_WINDOW)));
  const increased = expectedMag > earliestMag * (1 + AMOUNT_TOLERANCE);

  const last = sorted[sorted.length - 1];
  const sign = last.amountCents < 0 ? -1 : 1;

  return {
    intervalDays,
    expectedAmountCents: sign * expectedMag,
    previousAmountCents: increased ? sign * earliestMag : null,
    lastSeenDate: last.date,
    occurrenceCount: sorted.length,
  };
}

/** Human label for a (canonical-ish) interval. */
export function intervalLabel(
  intervalDays: number,
): "Weekly" | "Monthly" | "Quarterly" | "Yearly" {
  switch (nearestCanonical(intervalDays)) {
    case 7:
      return "Weekly";
    case 30:
      return "Monthly";
    case 90:
      return "Quarterly";
    default:
      return "Yearly";
  }
}

/** When the next occurrence is due: lastSeen + one interval (stays UTC-midnight). */
export function nextExpectedDate(lastSeen: Date, intervalDays: number): Date {
  return new Date(lastSeen.getTime() + intervalDays * DAY_MS);
}

/** Positive monthly-equivalent cost in cents (e.g. weekly × ~4.35, yearly ÷ 12). */
export function monthlyEquivalentCents(
  amountCents: number,
  intervalDays: number,
): number {
  if (intervalDays <= 0) return 0;
  return Math.round((Math.abs(amountCents) * AVG_DAYS_PER_MONTH) / intervalDays);
}

function calendarDayMs(yyyyMmDd: string): number {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/**
 * Activity/overdue state relative to `now` (Amsterdam calendar days). On-track
 * within ±tolerance of the next due date; one interval overdue → still active
 * but `missed`; beyond that → inactive (treated as cancelled).
 */
export function subscriptionState(
  lastSeen: Date,
  intervalDays: number,
  now: Date,
  tz: string = DEFAULT_TIMEZONE,
): SubscriptionState {
  const daysSince = Math.round(
    (calendarDayMs(zonedDateString(now, tz)) -
      calendarDayMs(lastSeen.toISOString().slice(0, 10))) /
      DAY_MS,
  );
  const overdue = daysSince - intervalDays;
  if (overdue <= TOLERANCE_DAYS) return { active: true, missed: false };
  if (overdue <= intervalDays + TOLERANCE_DAYS) return { active: true, missed: true };
  return { active: false, missed: false };
}
