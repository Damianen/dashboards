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
