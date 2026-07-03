// The ONLY place day-bucketing logic may live (see CLAUDE.md). Every `day`
// value in this app is the civil date in Europe/Amsterdam — never UTC.

// en-CA renders as YYYY-MM-DD.
const amsterdamDay = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Amsterdam",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Civil date ("YYYY-MM-DD") of the given instant in Europe/Amsterdam. */
export function dayOf(date: Date): string {
  return amsterdamDay.format(date);
}

/** UTC-midnight Date for a "YYYY-MM-DD" day, as Prisma expects for @db.Date columns. */
export function dayToDbDate(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

/** Today's civil date in Europe/Amsterdam. */
export function todayLocal(): string {
  return dayOf(new Date());
}

/**
 * Shift a "YYYY-MM-DD" civil date by `delta` calendar days (negative = earlier).
 * Pure string→string arithmetic anchored at noon UTC so a ±1 day step can never
 * be swallowed by a DST transition; the result is re-formatted in Amsterdam.
 */
export function shiftDay(day: string, delta: number): string {
  const at = new Date(`${day}T12:00:00.000Z`);
  at.setUTCDate(at.getUTCDate() + delta);
  return dayOf(at);
}

/** Civil date of a `@db.Date` column value: `day` is stored UTC-midnight (it IS
 *  the civil date), so slicing the ISO date part is the exact inverse of
 *  dayToDbDate() — no timezone shift. */
export function civilDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// en-GB with h23 renders as zero-padded "HH:mm" (24h), so slot times compare
// lexicographically ("07:30" < "21:00").
const amsterdamTime = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Amsterdam",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Wall-clock "HH:mm" (24h) of the given instant in Europe/Amsterdam. */
export function timeOfDay(date: Date): string {
  return amsterdamTime.format(date);
}

/**
 * Whole calendar days from `from` to `to` (both "YYYY-MM-DD"; negative when
 * `to` is earlier). Exact integer arithmetic on UTC-midnight anchors — DST
 * transitions between the two days can't skew the count.
 */
export function daysBetween(from: string, to: string): number {
  return Math.round(
    (dayToDbDate(to).getTime() - dayToDbDate(from).getTime()) / 86_400_000,
  );
}
