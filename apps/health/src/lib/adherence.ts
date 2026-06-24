// ADHERENCE helpers: a daily protein target from bodyweight, and "current streak" length
// over civil days. Pure and side-effect-free — the service feeds in the latest weight, the
// g/kg factor, and the set of days that "count"; this module does no I/O. Protein here is an
// intake-only target: it never nets calories and never feeds another target (CLAUDE.md).

import { shiftDay } from "@/lib/dates";

/** Streak lengths worth a one-time celebration push. Ascending. */
export const MILESTONES = [7, 30, 100] as const;

/**
 * The daily protein target in whole grams: bodyweight × g/kg, rounded. Intake-only —
 * a goal to reach, never subtracted from anything.
 */
export function proteinTarget(weightKg: number, gPerKg: number): number {
  return Math.round(weightKg * gPerKg);
}

/** The milestones a streak of `length` days has reached (subset of MILESTONES, ≤ length). */
export function milestonesReached(length: number): number[] {
  return MILESTONES.filter((m) => length >= m);
}

/** A current streak: its consecutive-day length and the civil day it started, or null/0
 *  when there is no live streak. */
export interface Streak {
  length: number;
  startDay: string | null;
}

/**
 * Length of the streak of consecutive civil days that "count" (have activity), ending at or
 * just before `today`. A day counts only if it is present in `activeDays` — this module never
 * invents activity, so a day with no real food/checks can never extend a streak (data honesty,
 * CLAUDE.md).
 *
 * "Today not yet": if `today` has no activity but yesterday does, the streak is still alive and
 * is counted back from yesterday — today is simply in progress, not a break. Walking backward
 * uses `shiftDay` so a ±1-day step is civil-day correct across DST and month boundaries.
 */
export function currentStreak(activeDays: string[], today: string): Streak {
  const active = new Set(activeDays);
  // Anchor the streak at today if it already counts, otherwise at yesterday (today-in-progress).
  const anchor = active.has(today) ? today : shiftDay(today, -1);
  if (!active.has(anchor)) return { length: 0, startDay: null };

  let length = 1;
  let day = shiftDay(anchor, -1);
  while (active.has(day)) {
    length += 1;
    day = shiftDay(day, -1);
  }
  return { length, startDay: shiftDay(anchor, -(length - 1)) };
}
