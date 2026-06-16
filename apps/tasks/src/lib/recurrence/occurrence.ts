// Occurrence stepping for the recurrence engine.
//
// All arithmetic happens in wall-clock calendar space (year/month/day integers
// + a fixed hour:minute), and the ONLY Date we ever build is the final
// conversion via wallTimeToInstant — the two-pass, DST-safe converter proven in
// dates.test.ts. We never add 86_400_000ms to a Date and hope: that is what
// keeps "18:00" at 18:00 across the March spring-forward and October fall-back,
// and all-day occurrences pinned to local midnight.

import { wallClockParts, wallTimeToInstant, zonedDayStart } from "@/lib/dates";

import { parseRRule, type RecurrenceRule, type TimeOfDay, type Weekday } from "./rrule";

interface Civil {
  year: number;
  month: number; // 1-12
  day: number;
}

const DAY_MS = 86_400_000;

// UTC is DST-free, so day arithmetic via Date.UTC is exact for calendar dates.
function civilToDayNumber(c: Civil): number {
  return Date.UTC(c.year, c.month - 1, c.day) / DAY_MS;
}

function dayNumberToCivil(n: number): Civil {
  const d = new Date(n * DAY_MS);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  };
}

function addDays(c: Civil, days: number): Civil {
  return dayNumberToCivil(civilToDayNumber(c) + days);
}

/** 0 = Monday … 6 = Sunday for a calendar date (timezone-independent). */
function weekdayOf(c: Civil): Weekday {
  const jsDay = new Date(Date.UTC(c.year, c.month - 1, c.day)).getUTCDay();
  return ((jsDay + 6) % 7) as Weekday;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function addMonths(year: number, month: number, n: number): { year: number; month: number } {
  const total = year * 12 + (month - 1) + n;
  return { year: Math.floor(total / 12), month: (total % 12) + 1 };
}

/** The day-of-month of the Nth (1..5) or last (-1) `weekday` in a month, or null. */
function nthWeekdayDay(
  year: number,
  month: number,
  ordinal: number,
  weekday: Weekday,
): number | null {
  const total = daysInMonth(year, month);
  if (ordinal === -1) {
    for (let day = total; day >= 1; day--)
      if (weekdayOf({ year, month, day }) === weekday) return day;
    return null;
  }
  const firstWeekday = weekdayOf({ year, month, day: 1 });
  const offset = (weekday - firstWeekday + 7) % 7;
  const day = 1 + offset + (ordinal - 1) * 7;
  return day <= total ? day : null;
}

// Guards against an unterminated walk; far beyond any real rule's spacing.
const MAX_STEPS = 2000;

function instantOf(
  c: Civil,
  time: TimeOfDay | null,
  timeZone: string,
): Date {
  return wallTimeToInstant(
    time
      ? { year: c.year, month: c.month, day: c.day, hour: time.hour, minute: time.minute }
      : { year: c.year, month: c.month, day: c.day },
    timeZone,
  );
}

/**
 * First occurrence whose instant is strictly after `afterMs`, with the rule's
 * phase anchored at the calendar day `anchor`. Returns null if none is found
 * within MAX_STEPS (our infinite grammar effectively never exhausts).
 */
function step(
  rule: RecurrenceRule,
  anchor: Civil,
  time: TimeOfDay | null,
  timeZone: string,
  afterMs: number,
): Date | null {
  const emit = (c: Civil): Date | null => {
    const instant = instantOf(c, time, timeZone);
    return instant.getTime() > afterMs ? instant : null;
  };

  if (rule.freq === "DAILY") {
    for (let k = 0; k < MAX_STEPS; k++) {
      const hit = emit(addDays(anchor, k * rule.interval));
      if (hit) return hit;
    }
    return null;
  }

  if (rule.freq === "WEEKLY") {
    if (!rule.byDay || rule.byDay.length === 0) {
      for (let k = 0; k < MAX_STEPS; k++) {
        const hit = emit(addDays(anchor, k * rule.interval * 7));
        if (hit) return hit;
      }
      return null;
    }
    const byDay = [...rule.byDay].sort((a, b) => a - b);
    const weekStart = addDays(anchor, -weekdayOf(anchor)); // Monday of anchor week
    for (let w = 0, steps = 0; steps < MAX_STEPS; w += rule.interval) {
      for (const bd of byDay) {
        steps++;
        const hit = emit(addDays(weekStart, w * 7 + bd));
        if (hit) return hit;
        if (steps >= MAX_STEPS) return null;
      }
    }
    return null;
  }

  if (rule.freq === "MONTHLY") {
    for (let k = 0; k < MAX_STEPS; k++) {
      const { year, month } = addMonths(anchor.year, anchor.month, k * rule.interval);
      let day: number | null;
      if (rule.byDayOrdinal) {
        day = nthWeekdayDay(year, month, rule.byDayOrdinal.ordinal, rule.byDayOrdinal.weekday);
      } else {
        // Plain monthly keeps the anchor day-of-month; months lacking that day
        // are SKIPPED (RFC 5545 BYMONTHDAY / Todoist), e.g. Jan 31 -> Mar 31.
        day = daysInMonth(year, month) >= anchor.day ? anchor.day : null;
      }
      if (day === null) continue;
      const hit = emit({ year, month, day });
      if (hit) return hit;
    }
    return null;
  }

  // YEARLY: same month/day each interval years; Feb 29 skips non-leap years.
  for (let k = 0; k < MAX_STEPS; k++) {
    const year = anchor.year + k * rule.interval;
    if (daysInMonth(year, anchor.month) < anchor.day) continue;
    const hit = emit({ year, month: anchor.month, day: anchor.day });
    if (hit) return hit;
  }
  return null;
}

function civilOf(instant: Date, timeZone: string): Civil {
  const p = wallClockParts(instant, timeZone);
  return { year: p.year, month: p.month, day: p.day };
}

function timeOf(instant: Date, timeZone: string): TimeOfDay {
  const p = wallClockParts(instant, timeZone);
  return { hour: p.hour, minute: p.minute };
}

/**
 * The next occurrence strictly after `after`, as a UTC instant, or null if the
 * rule is exhausted. The rule's phase is anchored at `after`'s calendar day —
 * so when `after` is a task's current dueAt (an occurrence), the result is the
 * following occurrence. For timed rules the time of day is taken from
 * `timeOfDay` when given, else read off `after`.
 */
export function nextOccurrence(
  rrule: string,
  after: Date,
  timezone: string,
  hasDueTime: boolean,
  timeOfDay?: TimeOfDay,
): Date | null {
  const rule = parseRRule(rrule);
  const anchor = civilOf(after, timezone);
  const time = hasDueTime ? (timeOfDay ?? timeOf(after, timezone)) : null;
  return step(rule, anchor, time, timezone, after.getTime());
}

/**
 * The first occurrence when scheduling a brand-new recurring task as of `now`.
 * Anchors the phase at `now`'s day so "every 3 days" starts today. All-day
 * rules let today qualify (threshold = just before local midnight); timed rules
 * whose time has already passed today roll forward to the next occurrence.
 */
export function firstOccurrence(
  rrule: string,
  now: Date,
  timezone: string,
  hasDueTime: boolean,
  timeOfDay?: TimeOfDay,
): Date | null {
  const rule = parseRRule(rrule);
  const anchor = civilOf(now, timezone);
  const time = hasDueTime ? (timeOfDay ?? null) : null;
  const afterMs = hasDueTime
    ? now.getTime()
    : zonedDayStart(now, timezone).getTime() - 1;
  return step(rule, anchor, time, timezone, afterMs);
}
