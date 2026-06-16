// Timezone-aware day helpers, Intl only. Finance buckets every monthly
// aggregation by booking date in Europe/Amsterdam (apps/finance/CLAUDE.md),
// and the sync window / one-snapshot-per-day logic both lean on zonedDayStart.
//
// Storage convention: instants are UTC. A "calendar day" is the wall-clock day
// in the given timezone, floored to local midnight expressed as a UTC instant.

export const DEFAULT_TIMEZONE = "Europe/Amsterdam";

const DAY_MS = 86_400_000;

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function wallClockParts(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(instant);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

function tzOffsetMs(instant: Date, timeZone: string): number {
  const p = wallClockParts(instant, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  // Compare against the instant truncated to whole seconds, matching the
  // second-granularity wall clock above.
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** UTC instant of local midnight on `instant`'s calendar day in `timeZone`. */
export function zonedDayStart(instant: Date, timeZone: string): Date {
  const p = wallClockParts(instant, timeZone);
  const wallMidnightUtc = Date.UTC(p.year, p.month - 1, p.day);
  let candidate = wallMidnightUtc - tzOffsetMs(instant, timeZone);
  // Second pass: the offset at midnight can differ from the offset at
  // `instant` when a DST transition falls in between.
  candidate = wallMidnightUtc - tzOffsetMs(new Date(candidate), timeZone);
  return new Date(candidate);
}

/** Local midnight `days` calendar days after the day-start instant `dayStart`. */
export function addDaysToDayStart(
  dayStart: Date,
  days: number,
  timeZone: string,
): Date {
  // +12h lands mid-day regardless of a ±1h DST shift, then re-floor.
  return zonedDayStart(
    new Date(dayStart.getTime() + days * DAY_MS + DAY_MS / 2),
    timeZone,
  );
}

/** The wall-clock calendar day (YYYY-MM-DD) of `instant` in `timeZone`. */
export function zonedDateString(
  instant: Date,
  timeZone: string = DEFAULT_TIMEZONE,
): string {
  const p = wallClockParts(instant, timeZone);
  const mm = String(p.month).padStart(2, "0");
  const dd = String(p.day).padStart(2, "0");
  return `${p.year}-${mm}-${dd}`;
}
