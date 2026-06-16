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

// ---------------------------------------------------------------------------
// Display + form helpers (client-safe, Intl only).

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** "YYYY-MM-DD" of `instant`'s calendar day in `timeZone`. */
export function localDayKey(instant: Date, timeZone: string): string {
  const p = wallClockParts(instant, timeZone);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

/** Whole calendar days from `now`'s local day to `instant`'s local day. */
function dayDiff(instant: Date, timeZone: string, now: Date): number {
  const day = zonedDayStart(instant, timeZone);
  const today = zonedDayStart(now, timeZone);
  // Round absorbs the ±1h a DST transition adds between the two midnights.
  return Math.round((day.getTime() - today.getTime()) / DAY_MS);
}

/**
 * Mirrors listOverdue semantics: timed tasks are overdue past their exact
 * time, all-day tasks from the first local midnight after their due day.
 */
export function isOverdue(
  dueAt: Date | null,
  hasDueTime: boolean,
  timeZone: string = DEFAULT_TIMEZONE,
  now: Date = new Date(),
): boolean {
  if (dueAt === null) return false;
  if (hasDueTime) return dueAt.getTime() < now.getTime();
  return dueAt.getTime() < zonedDayStart(now, timeZone).getTime();
}

/**
 * Compact due-date chip: "Today" / "Tomorrow" / "Fri" (2–6 days ahead) /
 * "12 Jun" ("12 Jun 2027" when the year differs), plus "14:30" when timed.
 */
export function formatDueChip(
  dueAt: Date,
  hasDueTime: boolean,
  timeZone: string = DEFAULT_TIMEZONE,
  now: Date = new Date(),
): string {
  const diff = dayDiff(dueAt, timeZone, now);
  let day: string;
  if (diff === 0) {
    day = "Today";
  } else if (diff === 1) {
    day = "Tomorrow";
  } else if (diff >= 2 && diff <= 6) {
    day = new Intl.DateTimeFormat("en", { timeZone, weekday: "short" }).format(
      dueAt,
    );
  } else {
    const p = wallClockParts(dueAt, timeZone);
    const month = new Intl.DateTimeFormat("en", {
      timeZone,
      month: "short",
    }).format(dueAt);
    const sameYear = p.year === wallClockParts(now, timeZone).year;
    day = sameYear ? `${p.day} ${month}` : `${p.day} ${month} ${p.year}`;
  }
  if (!hasDueTime) return day;
  const p = wallClockParts(dueAt, timeZone);
  return `${day} ${pad2(p.hour)}:${pad2(p.minute)}`;
}

/**
 * Day-group heading: "Today" / "Tomorrow" / "Friday" (2–6 days ahead) /
 * "Sat 20 Jun" ("Sat 2 Jan 2027" when the year differs).
 */
export function formatDayHeading(
  instant: Date,
  timeZone: string = DEFAULT_TIMEZONE,
  now: Date = new Date(),
): string {
  const diff = dayDiff(instant, timeZone, now);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff >= 2 && diff <= 6) {
    return new Intl.DateTimeFormat("en", { timeZone, weekday: "long" }).format(
      instant,
    );
  }
  const p = wallClockParts(instant, timeZone);
  const weekday = new Intl.DateTimeFormat("en", {
    timeZone,
    weekday: "short",
  }).format(instant);
  const month = new Intl.DateTimeFormat("en", {
    timeZone,
    month: "short",
  }).format(instant);
  const base = `${weekday} ${p.day} ${month}`;
  const sameYear = p.year === wallClockParts(now, timeZone).year;
  return sameYear ? base : `${base} ${p.year}`;
}

export interface WallTime {
  year: number;
  month: number;
  day: number;
  hour?: number;
  minute?: number;
}

/**
 * UTC instant for a wall-clock time in `timeZone` — the DST-safe inverse of
 * wallClockParts, two-pass like zonedDayStart. Nonexistent spring-forward
 * times resolve one hour later.
 */
export function wallTimeToInstant(wall: WallTime, timeZone: string): Date {
  const wallUtc = Date.UTC(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hour ?? 0,
    wall.minute ?? 0,
  );
  let candidate = wallUtc - tzOffsetMs(new Date(wallUtc), timeZone);
  candidate = wallUtc - tzOffsetMs(new Date(candidate), timeZone);
  return new Date(candidate);
}

/** Values for <input type="date"> / <input type="time"> editing `dueAt`. */
export function dueAtToInputValues(
  dueAt: Date,
  hasDueTime: boolean,
  timeZone: string,
): { date: string; time: string | null } {
  const p = wallClockParts(dueAt, timeZone);
  return {
    date: `${p.year}-${pad2(p.month)}-${pad2(p.day)}`,
    time: hasDueTime ? `${pad2(p.hour)}:${pad2(p.minute)}` : null,
  };
}

/** Inverse of dueAtToInputValues; an empty or missing time means all-day. */
export function inputValuesToDueAt(
  date: string,
  time: string | null,
  timeZone: string,
): { dueAt: Date; hasDueTime: boolean } {
  const [year, month, day] = date.split("-").map(Number);
  if (time !== null && time !== "") {
    const [hour, minute] = time.split(":").map(Number);
    return {
      dueAt: wallTimeToInstant({ year, month, day, hour, minute }, timeZone),
      hasDueTime: true,
    };
  }
  return {
    dueAt: wallTimeToInstant({ year, month, day }, timeZone),
    hasDueTime: false,
  };
}
