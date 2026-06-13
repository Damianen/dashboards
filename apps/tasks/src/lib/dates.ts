// Date-window helpers for the task views (today/upcoming/overdue), Intl only.
//
// Storage convention: all instants are UTC. All-day tasks (hasDueTime=false)
// have dueAt normalized on write to local midnight of their due day in the
// task's timezone, expressed as a UTC instant. That write-side normalization
// is what makes the half-open windows below line up with day boundaries.

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

export interface DateWindow {
  start: Date;
  end: Date;
}

/** Half-open window [today 00:00 local, tomorrow 00:00 local) as UTC instants. */
export function todayWindow(
  timeZone: string = DEFAULT_TIMEZONE,
  now: Date = new Date(),
): DateWindow {
  const start = zonedDayStart(now, timeZone);
  return { start, end: addDaysToDayStart(start, 1, timeZone) };
}

/** Half-open window [tomorrow 00:00 local, tomorrow+days 00:00 local). */
export function upcomingWindow(
  days: number,
  timeZone: string = DEFAULT_TIMEZONE,
  now: Date = new Date(),
): DateWindow {
  const todayStart = zonedDayStart(now, timeZone);
  const start = addDaysToDayStart(todayStart, 1, timeZone);
  return { start, end: addDaysToDayStart(start, days, timeZone) };
}

/** All-day due dates snap to local midnight of their due day; timed pass through. */
export function normalizeDueAt(
  dueAt: Date,
  hasDueTime: boolean,
  timeZone: string,
): Date {
  return hasDueTime ? dueAt : zonedDayStart(dueAt, timeZone);
}
