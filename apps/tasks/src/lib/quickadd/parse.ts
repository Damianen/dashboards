// Natural-language quick-add parser. Pure and dependency-light so the SAME code
// runs in the browser (live preview chips) and on the server (authoritative
// create). It returns human NAMES — projectName / sectionName / labelNames —
// not ids; resolution to ids (and any auto-create) happens server-side.
//
// Dates/times are parsed with chrono-node interpreted in the task timezone
// (Europe/Amsterdam by default). We read chrono's wall-clock COMPONENTS rather
// than its absolute .date(), then rebuild the instant with the app's DST-safe
// wallTimeToInstant — so parsing never depends on the host's system timezone.

import * as chrono from "chrono-node";

import {
  DEFAULT_TIMEZONE,
  tzOffsetMinutes,
  wallTimeToInstant,
} from "@/lib/dates";

export interface ParseContext {
  /** "Now" for relative dates ("tomorrow"); defaults to new Date(). */
  now?: Date;
  /** IANA timezone the wall-clock text is read in; defaults to Europe/Amsterdam. */
  timezone?: string;
  /** Which chrono locales to try; defaults to "both" (English + Dutch). */
  locale?: "en" | "nl" | "both";
}

export interface ParseResult {
  content: string;
  dueAt?: Date;
  hasDueTime: boolean;
  dueString?: string;
  priority?: 1 | 2 | 3 | 4;
  projectName?: string;
  sectionName?: string;
  labelNames: string[];
  recurrenceRaw?: string;
  // rrule is intentionally absent — the "every …" phrase is captured raw; its
  // conversion to an RFC 5545 rrule happens server-side in createTaskFromText
  // (the parser stays pure and name-based).
}

// An "every …" / "every! …" recurrence phrase, bounded to the Todoist interval
// grammar so it doesn't swallow the task title. Matched ANYWHERE in the text
// (not just leading) so "water plants every! 3 days 18:00" splits cleanly into
// "water plants" + "every! 3 days 18:00". Captures an optional ordinal
// ("3rd friday") and an optional trailing time ("18:00" / "9am"), both of which
// toRRule re-parses on the server.
const WEEKDAYS =
  "mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|saturdays?|sundays?|mon|tues?|weds?|thur?s?|fri|sat|sun";
const UNITS =
  "days?|weeks?|months?|years?|mornings?|afternoons?|evenings?|nights?|weekdays?|weekends?|hours?|minutes?";
const ORDINAL = "first|second|third|fourth|fifth|last|\\d+(?:st|nd|rd|th)";
const RECUR_PREFIX = `(?:\\s+(?:other|${ORDINAL}|\\d+))?`;
// Only real time tokens (require ":mm", am/pm, or a trailing "h") so a bare
// interval like "3" in "every 3 days" is never mistaken for a time.
const RECUR_TIME =
  "(?:\\s+(?:at\\s+)?(?:\\d{1,2}:\\d{2}(?:\\s*[ap]m)?|\\d{1,2}\\s*[ap]m|\\d{1,2}h))?";
const RECURRENCE_RE = new RegExp(
  `(?:^|\\s)(every\\s*!?${RECUR_PREFIX}\\s+(?:${UNITS}|${WEEKDAYS})${RECUR_TIME})\\b`,
  "i",
);

// Tokens. Bare names stop at whitespace or the next token sigil; quoted names
// allow spaces. The `(?:^|\s)` prefix keeps "6/20" or an email's "@" from being
// mistaken for a /section or @label token.
const PROJECT_RE = /(?:^|\s)#(?:"([^"]+)"|([^\s#@/]+))/;
const SECTION_RE = /(?:^|\s)\/(?:"([^"]+)"|([^\s#@/]+))/;
const LABEL_RE = /(?:^|\s)@(?:"([^"]+)"|([^\s#@/]+))/g;
const PRIORITY_RE = /(?:^|\s)p([1-4])\b/i;

function spaces(n: number): string {
  return " ".repeat(n);
}

/** Replace `[start, start+len)` of `s` with spaces, preserving every index. */
function blank(s: string, start: number, len: number): string {
  return s.slice(0, start) + spaces(len) + s.slice(start + len);
}

export function parse(text: string, context: ParseContext = {}): ParseResult {
  const now = context.now ?? new Date();
  const timezone = context.timezone ?? DEFAULT_TIMEZONE;
  const locale = context.locale ?? "both";

  // We blank each consumed span (instead of deleting it) so chrono still sees
  // valid character offsets and the leftover collapses cleanly into the title.
  let working = text;
  let recurrenceRaw: string | undefined;
  let projectName: string | undefined;
  let sectionName: string | undefined;
  const labelNames: string[] = [];
  let priority: 1 | 2 | 3 | 4 | undefined;

  // 1. Recurrence (anywhere) — capture raw, blank it (incl. its trailing time),
  //    and skip chrono date parsing; the server derives dueAt from the rule.
  const rec = RECURRENCE_RE.exec(working);
  if (rec) {
    recurrenceRaw = rec[1].replace(/\s+/g, " ").trim();
    working = blank(working, rec.index, rec[0].length);
  }

  // 2. Tokens — capture names/priority, blanking each match.
  working = working.replace(PROJECT_RE, (m, quoted?: string, bare?: string) => {
    projectName = quoted ?? bare;
    return spaces(m.length);
  });
  working = working.replace(SECTION_RE, (m, quoted?: string, bare?: string) => {
    sectionName = quoted ?? bare;
    return spaces(m.length);
  });
  working = working.replace(LABEL_RE, (m, quoted?: string, bare?: string) => {
    const name = quoted ?? bare ?? "";
    if (!labelNames.some((l) => l.toLowerCase() === name.toLowerCase()))
      labelNames.push(name);
    return spaces(m.length);
  });
  working = working.replace(PRIORITY_RE, (m, digit: string) => {
    priority = Number(digit) as 1 | 2 | 3 | 4;
    return spaces(m.length);
  });

  // 3. Date / time via chrono (skipped when a recurrence owns the phrase).
  let dueAt: Date | undefined;
  let hasDueTime = false;
  let dueString: string | undefined = recurrenceRaw;

  if (!recurrenceRaw) {
    const result = parseDate(working, now, timezone, locale);
    if (result) {
      const y = result.start.get("year");
      const mo = result.start.get("month");
      const d = result.start.get("day");
      if (y !== null && mo !== null && d !== null) {
        hasDueTime = result.start.isCertain("hour");
        const wall = hasDueTime
          ? {
              year: y,
              month: mo,
              day: d,
              hour: result.start.get("hour") ?? 0,
              minute: result.start.get("minute") ?? 0,
            }
          : { year: y, month: mo, day: d };
        dueAt = wallTimeToInstant(wall, timezone);
        dueString = result.text;
        working = blank(working, result.index, result.text.length);
      }
    }
  }

  const content = working.replace(/\s+/g, " ").trim();

  return {
    content,
    ...(dueAt ? { dueAt } : {}),
    hasDueTime,
    ...(dueString ? { dueString } : {}),
    ...(priority ? { priority } : {}),
    ...(projectName ? { projectName } : {}),
    ...(sectionName ? { sectionName } : {}),
    labelNames,
    ...(recurrenceRaw ? { recurrenceRaw } : {}),
  };
}

/** Run chrono (English and/or Dutch) and return the leftmost match, if any. */
function parseDate(
  text: string,
  now: Date,
  timezone: string,
  locale: "en" | "nl" | "both",
): chrono.ParsedResult | null {
  const ref: chrono.ParsingReference = {
    instant: now,
    timezone: tzOffsetMinutes(now, timezone),
  };
  const option: chrono.ParsingOption = { forwardDate: true };
  const candidates: chrono.ParsedResult[] = [];
  if (locale !== "nl") candidates.push(...chrono.parse(text, ref, option));
  if (locale !== "en") candidates.push(...chrono.nl.parse(text, ref, option));
  if (candidates.length === 0) return null;
  // Leftmost match wins; a stable sort keeps English ahead of Dutch on a tie.
  candidates.sort((a, b) => a.index - b.index);
  return candidates[0];
}
