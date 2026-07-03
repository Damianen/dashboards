// Pure resolution of a manual sleep entry's window. No I/O and no clock —
// `now` is injected — so the maths is unit-testable. Invalid input throws
// DomainError (the lib/meals.ts / lib/rules.ts convention; a plain error
// class with no server deps) so routes answer 400 and MCP tools a readable
// tool error.

import { DomainError } from "@/server/services/errors";

const MS_PER_MIN = 60_000;
const MAX_SPAN_MS = 24 * 60 * MS_PER_MIN;

export interface SleepWindowInput {
  /** ISO instant. Mutually exclusive with durationMin (schema-enforced; re-checked here). */
  bedtimeStart?: string;
  /** ISO instant. Defaults to `now` — "woke just now". */
  bedtimeEnd?: string;
  /** Whole minutes asleep; the start is back-computed from the end. */
  durationMin?: number;
}

export interface SleepWindow {
  bedtimeStart: Date;
  bedtimeEnd: Date;
  totalSleepMin: number;
}

/**
 * Resolve a manual entry into a concrete [bedtimeStart, bedtimeEnd] window and
 * whole-minute duration. Duration path: start = end − durationMin. Times path:
 * duration = round((end − start) / 60s). All arithmetic is instant (ms) maths —
 * a night across a DST switch gets its true elapsed time, not the wall-clock
 * difference. Rejects end ≤ start, spans over 24h, and sub-minute spans.
 */
export function resolveSleepWindow(
  input: SleepWindowInput,
  now: Date,
): SleepWindow {
  const bedtimeEnd =
    input.bedtimeEnd != null ? new Date(input.bedtimeEnd) : now;

  if (input.durationMin != null) {
    if (input.bedtimeStart != null) {
      throw new DomainError("provide bedtimeStart or durationMin, not both");
    }
    if (!Number.isInteger(input.durationMin) || input.durationMin < 1) {
      throw new DomainError("durationMin must be a whole number of minutes ≥ 1");
    }
    if (input.durationMin * MS_PER_MIN > MAX_SPAN_MS) {
      throw new DomainError("a sleep entry can span at most 24 hours");
    }
    return {
      bedtimeStart: new Date(bedtimeEnd.getTime() - input.durationMin * MS_PER_MIN),
      bedtimeEnd,
      totalSleepMin: input.durationMin,
    };
  }

  if (input.bedtimeStart == null) {
    throw new DomainError("provide bedtimeStart or durationMin");
  }
  const bedtimeStart = new Date(input.bedtimeStart);
  const spanMs = bedtimeEnd.getTime() - bedtimeStart.getTime();
  if (spanMs <= 0) {
    throw new DomainError("bedtimeEnd must be after bedtimeStart");
  }
  if (spanMs > MAX_SPAN_MS) {
    throw new DomainError("a sleep entry can span at most 24 hours");
  }
  const totalSleepMin = Math.round(spanMs / MS_PER_MIN);
  if (totalSleepMin < 1) {
    throw new DomainError("a sleep entry must span at least a minute");
  }
  return { bedtimeStart, bedtimeEnd, totalSleepMin };
}
