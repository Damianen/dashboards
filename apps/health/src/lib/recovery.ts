// RECOVERY engine: turn a few days of Oura signals into a gentle under-recovery / illness
// early-warning. Pure and side-effect-free — the service feeds in the per-day numeric series
// (resting HR, HRV, body-temperature deviation); this module does the rolling-baseline +
// z-score math and never touches I/O.
//
// This is a TREND SIGNAL, never a diagnosis or medical advice (see the service / UI / MCP
// copy). An insufficient baseline always yields "insufficient" — we never guess.

import { shiftDay } from "@/lib/dates";

/** Minimum prior samples before a baseline is trustworthy; below this a metric is "insufficient". */
export const MIN_BASELINE_SAMPLES = 7;
/** z-score at which a metric is mildly off baseline. */
export const Z_ELEVATED = 1.5;
/** z-score at which a single metric is far enough off to warn on its own. */
export const Z_HIGH = 2.5;

/**
 * How a single metric reads today. "none" = within baseline; "insufficient" = no usable
 * baseline (or no reading today) so it can't be judged. `deviationFlag` only ever returns the
 * first three; the service substitutes "insufficient" when there's nothing to compare against.
 */
export type Flag = "none" | "elevated" | "high" | "insufficient";

/** Overall recovery read for a day. `insufficient` = not enough baseline to say anything. */
export type RecoveryStatus = "normal" | "elevated" | "high" | "insufficient";

/**
 * Which direction is the *bad* one for a metric. Resting HR and temperature deviation are
 * "high-bad" (a spike is the warning); HRV is "low-bad" (a drop is the warning).
 */
export type Direction = "high-bad" | "low-bad";

/** A rolling baseline: the mean and (population) standard deviation over `n` prior samples. */
export interface Baseline {
  mean: number;
  sd: number;
  n: number;
}

/**
 * Mean + population stddev over the most-recent `window` of `prior` (today already excluded by
 * the caller). Returns null when fewer than MIN_BASELINE_SAMPLES values exist — too little
 * history to judge a deviation, so the caller treats the metric as "insufficient".
 */
export function rollingBaseline(prior: number[], window: number): Baseline | null {
  const recent = prior.slice(-window);
  const n = recent.length;
  if (n < MIN_BASELINE_SAMPLES) return null;
  const mean = recent.reduce((sum, v) => sum + v, 0) / n;
  const variance = recent.reduce((sum, v) => sum + (v - mean) ** 2, 0) / n;
  return { mean, sd: Math.sqrt(variance), n };
}

/** Signed z-score of `today` against `baseline`, or null when the baseline can't discriminate. */
export function zScore(today: number, baseline: Baseline): number | null {
  if (baseline.sd <= 0) return null;
  return (today - baseline.mean) / baseline.sd;
}

/**
 * Flag a metric by how far `today` deviates from `baseline` in the *bad* direction. A deviation
 * the "good" way (e.g. resting HR below baseline, HRV above it) is never flagged. A degenerate
 * baseline (sd ≤ 0, i.e. a flat history) yields "none" so it can never false-alarm.
 */
export function deviationFlag(
  today: number,
  baseline: Baseline,
  dir: Direction,
): Flag {
  const z = zScore(today, baseline);
  if (z == null) return "none";
  // Re-orient so a positive `bad` always means "worse".
  const bad = dir === "high-bad" ? z : -z;
  if (bad >= Z_HIGH) return "high";
  if (bad >= Z_ELEVATED) return "elevated";
  return "none";
}

/** The three metrics that make up a recovery read (each may be "insufficient"). */
export interface RecoveryFlags {
  restingHr: Flag;
  hrv: Flag;
  tempDeviation: Flag;
}

/**
 * Combine the per-metric flags into one status. A single metric crossing the HIGH threshold OR
 * two-or-more metrics deviating together is enough to warn ("high") — so a lone temperature
 * spike (the earliest illness signal) still surfaces. One mild signal alone is "elevated".
 * Only when NO metric has a usable baseline (all "insufficient") is the overall read
 * "insufficient"; otherwise unusable metrics are simply ignored.
 */
export function recoveryStatus(flags: RecoveryFlags): RecoveryStatus {
  const values = [flags.restingHr, flags.hrv, flags.tempDeviation];
  if (values.every((f) => f === "insufficient")) return "insufficient";
  const flagged = values.filter((f) => f === "elevated" || f === "high");
  if (flagged.length === 0) return "normal";
  if (flagged.some((f) => f === "high") || flagged.length >= 2) return "high";
  return "elevated";
}

/** A single day's overall recovery read, used to trace the current episode. */
export interface DailyStatus {
  day: string;
  status: RecoveryStatus;
}

/** A day's status counts toward an episode if it's notably off baseline (elevated or high). */
function isEpisodeDay(status: RecoveryStatus): boolean {
  return status === "elevated" || status === "high";
}

/**
 * The civil day the current under-recovery episode started, or null when there is no live
 * episode. Mirrors `currentStreak`: anchor at today if it's off baseline, else yesterday
 * (today's data may not be in yet), then walk back over consecutive off-baseline days. The run
 * resets the moment a `normal`/`insufficient`/missing day breaks it, so a fresh episode later
 * gets a new start day — exactly what the push dedupe keys on.
 */
export function currentEpisodeStart(
  statuses: DailyStatus[],
  today: string,
): string | null {
  const byDay = new Map(statuses.map((s) => [s.day, s.status]));
  const off = (day: string): boolean => {
    const s = byDay.get(day);
    return s != null && isEpisodeDay(s);
  };

  const anchor = off(today) ? today : shiftDay(today, -1);
  if (!off(anchor)) return null;

  let start = anchor;
  let day = shiftDay(anchor, -1);
  while (off(day)) {
    start = day;
    day = shiftDay(day, -1);
  }
  return start;
}
