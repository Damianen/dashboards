// Recurrence rule codec + natural-language parser + human description.
//
// We hand-roll a small RFC 5545 subset rather than depend on the `rrule`
// library: our grammar is closed (DAILY/WEEKLY/MONTHLY/YEARLY + INTERVAL +
// BYDAY) and the library interprets dates in UTC/host-tz, which fights this
// app's DST-safe wall-clock approach (see occurrence.ts). We still emit and
// store canonical RFC 5545 RRULE strings so the data stays interoperable.
//
// Pure and dependency-light: the SAME code runs in the browser (quick-add
// preview, detail-sheet description) and on the server (authoritative create
// + completeTask advancement).

/** RFC 5545 frequency, restricted to the forms our grammar produces. */
export type Freq = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

/** 0 = Monday … 6 = Sunday, matching RFC 5545 BYDAY ordering. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** Structural form of the RRULEs we emit (a closed subset of RFC 5545). */
export interface RecurrenceRule {
  freq: Freq;
  /** Repeat every `interval` periods; >= 1. */
  interval: number;
  /** WEEKLY: the weekdays it lands on ("every weekday" => MO..FR). */
  byDay?: Weekday[];
  /** MONTHLY: the Nth (1..5) or last (-1) weekday, e.g. "3rd friday" => 3 FR. */
  byDayOrdinal?: { ordinal: number; weekday: Weekday };
}

/** Wall-clock time of day a recurrence fires at, in the task timezone. */
export interface TimeOfDay {
  hour: number;
  minute: number;
}

export interface ToRRuleResult {
  /** Canonical RFC 5545, e.g. "FREQ=DAILY;INTERVAL=3". */
  rrule: string;
  /** Todoist "every!" — advance from completion rather than the due date. */
  recursFromCompletion: boolean;
  /** True when a time clause was given ("every monday 9am"). */
  hasDueTime: boolean;
  /** The parsed time when `hasDueTime`, else null. */
  time: TimeOfDay | null;
}

/** Thrown when a phrase doesn't match the supported recurrence grammar. */
export class RecurrenceParseError extends Error {
  constructor(phrase: string) {
    super(`unrecognized recurrence: ${phrase}`);
    this.name = "RecurrenceParseError";
  }
}

// MO..SU. Index is our Weekday; value is the RFC 5545 two-letter code.
const WEEKDAY_CODES = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;
const WEEKDAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

// Names + abbreviations -> Weekday.
const WEEKDAY_LOOKUP: Record<string, Weekday> = {
  monday: 0,
  mon: 0,
  tuesday: 1,
  tues: 1,
  tue: 1,
  wednesday: 2,
  weds: 2,
  wed: 2,
  thursday: 3,
  thurs: 3,
  thur: 3,
  thu: 3,
  friday: 4,
  fri: 4,
  saturday: 5,
  sat: 5,
  sunday: 6,
  sun: 6,
};

const ORDINAL_WORDS: Record<string, number> = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  last: -1,
};

function lookupWeekday(token: string): Weekday | undefined {
  return WEEKDAY_LOOKUP[token] ?? WEEKDAY_LOOKUP[token.replace(/s$/, "")];
}

function ordinalFromToken(token: string): number | null {
  if (token in ORDINAL_WORDS) return ORDINAL_WORDS[token];
  const m = /^(\d+)(?:st|nd|rd|th)$/.exec(token);
  if (m) return Number(m[1]);
  return null;
}

// A trailing time clause: "18:00", "9:30", "9am", "9 pm", "at 14:30", "9h".
const TIME_RE =
  /\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*h?$/i;

function parseTimeClause(core: string): { core: string; time: TimeOfDay | null } {
  const m = TIME_RE.exec(core);
  if (!m) return { core, time: null };
  // Require a real time signal: a ":mm", an am/pm, or a trailing "h"; a bare
  // number like "every 3 days" must NOT be eaten as a time.
  const hasMinutes = m[2] !== undefined;
  const meridiem = m[3]?.toLowerCase();
  const trailingH = /h$/i.test(m[0]);
  if (!hasMinutes && !meridiem && !trailingH) return { core, time: null };
  let hour = Number(m[1]);
  const minute = hasMinutes ? Number(m[2]) : 0;
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return { core, time: null };
  return { core: core.slice(0, m.index).trim(), time: { hour, minute } };
}

/**
 * Parse a Todoist-style recurrence phrase into a canonical RRULE + flags.
 * Examples: "every day", "every! 3 days 18:00", "every 3rd friday",
 * "every weekday", "every monday 9am". Throws RecurrenceParseError otherwise.
 */
export function toRRule(naturalLanguage: string): ToRRuleResult {
  const original = naturalLanguage.trim();
  const lower = original.toLowerCase().replace(/\s+/g, " ");

  const everyMatch = /^every\s*(!)?\s*/.exec(lower);
  if (!everyMatch) throw new RecurrenceParseError(original);
  const recursFromCompletion = everyMatch[1] === "!";
  let core = lower.slice(everyMatch[0].length).trim();
  if (core.length === 0) throw new RecurrenceParseError(original);

  const { core: withoutTime, time } = parseTimeClause(core);
  core = withoutTime;

  const tokens = core.split(" ").filter((t) => t.length > 0);
  const rule = parseCore(tokens, original);

  return {
    rrule: formatRRule(rule),
    recursFromCompletion,
    hasDueTime: time !== null,
    time,
  };
}

function parseCore(tokens: string[], original: string): RecurrenceRule {
  if (tokens.length === 0) throw new RecurrenceParseError(original);

  // Ordinal weekday: "3rd friday" / "first monday" / "last friday".
  if (tokens.length === 2) {
    const ordinal = ordinalFromToken(tokens[0]);
    const weekday = lookupWeekday(tokens[1]);
    if (ordinal !== null && weekday !== undefined)
      return { freq: "MONTHLY", interval: 1, byDayOrdinal: { ordinal, weekday } };
  }

  let interval = 1;
  let rest = tokens;
  if (tokens[0] === "other") {
    interval = 2;
    rest = tokens.slice(1);
  } else if (/^\d+$/.test(tokens[0])) {
    interval = Number(tokens[0]);
    rest = tokens.slice(1);
  }
  if (rest.length !== 1 || interval < 1) throw new RecurrenceParseError(original);

  const unit = rest[0];
  const weekday = lookupWeekday(unit);
  if (weekday !== undefined)
    return { freq: "WEEKLY", interval, byDay: [weekday] };

  switch (unit) {
    case "day":
    case "days":
      return { freq: "DAILY", interval };
    case "week":
    case "weeks":
      return { freq: "WEEKLY", interval };
    case "month":
    case "months":
      return { freq: "MONTHLY", interval };
    case "year":
    case "years":
      return { freq: "YEARLY", interval };
    case "weekday":
    case "weekdays":
      return { freq: "WEEKLY", interval, byDay: [0, 1, 2, 3, 4] };
    case "weekend":
    case "weekends":
      return { freq: "WEEKLY", interval, byDay: [5, 6] };
    default:
      throw new RecurrenceParseError(original);
  }
}

/** Serialize a RecurrenceRule to a canonical RFC 5545 RRULE string. */
export function formatRRule(rule: RecurrenceRule): string {
  const parts = [`FREQ=${rule.freq}`];
  if (rule.interval > 1) parts.push(`INTERVAL=${rule.interval}`);
  if (rule.byDay && rule.byDay.length > 0)
    parts.push(`BYDAY=${rule.byDay.map((d) => WEEKDAY_CODES[d]).join(",")}`);
  if (rule.byDayOrdinal)
    parts.push(
      `BYDAY=${rule.byDayOrdinal.ordinal}${WEEKDAY_CODES[rule.byDayOrdinal.weekday]}`,
    );
  return parts.join(";");
}

function codeToWeekday(code: string): Weekday {
  const i = WEEKDAY_CODES.indexOf(code as (typeof WEEKDAY_CODES)[number]);
  if (i === -1) throw new Error(`invalid weekday code: ${code}`);
  return i as Weekday;
}

/** Parse a canonical RRULE string back into a RecurrenceRule. */
export function parseRRule(rrule: string): RecurrenceRule {
  const fields = new Map<string, string>();
  for (const part of rrule.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    fields.set(part.slice(0, eq).toUpperCase(), part.slice(eq + 1));
  }
  const freq = fields.get("FREQ");
  if (
    freq !== "DAILY" &&
    freq !== "WEEKLY" &&
    freq !== "MONTHLY" &&
    freq !== "YEARLY"
  )
    throw new Error(`invalid rrule freq: ${rrule}`);
  const interval = fields.has("INTERVAL") ? Number(fields.get("INTERVAL")) : 1;
  if (!Number.isInteger(interval) || interval < 1)
    throw new Error(`invalid rrule interval: ${rrule}`);

  const rule: RecurrenceRule = { freq, interval };
  const byDay = fields.get("BYDAY");
  if (byDay) {
    const tokens = byDay.split(",");
    const ordinalMatch = /^(-?\d+)([A-Z]{2})$/.exec(tokens[0]);
    if (tokens.length === 1 && ordinalMatch) {
      rule.byDayOrdinal = {
        ordinal: Number(ordinalMatch[1]),
        weekday: codeToWeekday(ordinalMatch[2]),
      };
    } else {
      rule.byDay = tokens.map(codeToWeekday);
    }
  }
  return rule;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function ordinalName(ordinal: number): string {
  if (ordinal === -1) return "last";
  const suffix =
    ordinal === 1 ? "st" : ordinal === 2 ? "nd" : ordinal === 3 ? "rd" : "th";
  return `${ordinal}${suffix}`;
}

function intervalPhrase(interval: number, singular: string, plural: string): string {
  if (interval === 1) return `Every ${singular}`;
  if (interval === 2) return `Every other ${singular}`;
  return `Every ${interval} ${plural}`;
}

function arraysEqual(a: Weekday[], b: Weekday[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/**
 * Human-readable description for the detail sheet, e.g. "Every 3 days at 18:00".
 * The "every!" (recursFromCompletion) distinction is intentionally not surfaced,
 * matching Todoist — the description reflects only the schedule.
 */
export function describeRRule(rrule: string, time?: TimeOfDay | null): string {
  const rule = parseRRule(rrule);
  let base: string;
  switch (rule.freq) {
    case "DAILY":
      base = intervalPhrase(rule.interval, "day", "days");
      break;
    case "WEEKLY":
      if (rule.byDay && rule.byDay.length > 0) {
        if (arraysEqual(rule.byDay, [0, 1, 2, 3, 4])) base = "Every weekday";
        else if (arraysEqual(rule.byDay, [5, 6])) base = "Every weekend";
        else {
          const names = rule.byDay.map((d) => WEEKDAY_NAMES[d]).join(", ");
          base =
            rule.interval === 1
              ? `Every ${names}`
              : `Every ${rule.interval} weeks on ${names}`;
        }
      } else {
        base = intervalPhrase(rule.interval, "week", "weeks");
      }
      break;
    case "MONTHLY":
      if (rule.byDayOrdinal) {
        base = `Every ${ordinalName(rule.byDayOrdinal.ordinal)} ${WEEKDAY_NAMES[rule.byDayOrdinal.weekday]}`;
      } else {
        base = intervalPhrase(rule.interval, "month", "months");
      }
      break;
    case "YEARLY":
      base = intervalPhrase(rule.interval, "year", "years");
      break;
  }
  if (time) return `${base} at ${pad2(time.hour)}:${pad2(time.minute)}`;
  return base;
}
