// Cross-domain OBSERVATIONS: correlational hypotheses between metrics the app already
// captures (caffeine, sleep, readiness, lifting volume, weight). Every observation is a
// HYPOTHESIS with its sample size (n) stated — never a causal claim, never used to change
// a target (see CLAUDE.md guardrails). Pure and side-effect-free: the service feeds it
// aligned daily series; this module does no I/O.

import { shiftDay } from "@/lib/dates";

/**
 * A correlation needs at least this many paired days to be reported at all. Below it a
 * detector returns null — the overlap is too thin to even hypothesise about.
 */
export const MIN_PAIRED_DAYS = 8;

/** A metric's value on one civil day ("YYYY-MM-DD", Europe/Amsterdam). */
export interface DayValue {
  day: string;
  value: number;
}

/** A day's late-caffeine flag (true = a caffeine source was logged at/after the
 *  configured hour that day). */
export interface DayFlag {
  day: string;
  flag: boolean;
}

export type Direction = "positive" | "negative" | "none";

export interface Observation {
  /** Stable detector id (also the dedupe key for notifications). */
  id: string;
  /** Short human title for the card. */
  title: string;
  /** Plain-language finding — always states n, always framed as a tendency, never causal. */
  finding: string;
  /** Sign of the relationship. */
  direction: Direction;
  /** Signed correlation in [-1, 1] (point-biserial for the binary late-caffeine case).
   *  Rank observations by |strength|. */
  strength: number;
  /** Paired days behind the correlation. */
  n: number;
  /** The rolling window (days) the detector ran over. */
  windowDays: number;
}

/**
 * Pearson correlation of the (x, y) pairs, or null when it is undefined: fewer than two
 * pairs, or zero variance on either axis. A flat series has no correlation to measure —
 * that null is also what makes an all-true / all-false binary flag report nothing.
 */
export function pearson(pairs: [number, number][]): number | null {
  const n = pairs.length;
  if (n < 2) return null;

  let xMean = 0;
  let yMean = 0;
  for (const [x, y] of pairs) {
    xMean += x;
    yMean += y;
  }
  xMean /= n;
  yMean /= n;

  let num = 0;
  let xSS = 0;
  let ySS = 0;
  for (const [x, y] of pairs) {
    const dx = x - xMean;
    const dy = y - yMean;
    num += dx * dy;
    xSS += dx * dx;
    ySS += dy * dy;
  }
  if (xSS === 0 || ySS === 0) return null;

  const r = num / Math.sqrt(xSS * ySS);
  // Clamp tiny floating-point overshoot so the result stays a clean [-1, 1].
  return Math.max(-1, Math.min(1, r));
}

/**
 * Inner-join two daily series on the day, optionally lagging y by `lagDays` calendar days:
 * each x at day D pairs with y at day D+lag. Returns [x, y] for the days present on both
 * sides (after the shift), in x's order.
 */
export function alignByDay(
  x: DayValue[],
  y: DayValue[],
  lagDays = 0,
): [number, number][] {
  const yByDay = new Map<string, number>();
  for (const p of y) yByDay.set(p.day, p.value);

  const pairs: [number, number][] = [];
  for (const p of x) {
    const key = lagDays === 0 ? p.day : shiftDay(p.day, lagDays);
    const yVal = yByDay.get(key);
    if (yVal !== undefined) pairs.push([p.value, yVal]);
  }
  return pairs;
}

function fmtR(r: number): string {
  return r.toFixed(2);
}

function directionOf(value: number): Direction {
  if (value > 0) return "positive";
  if (value < 0) return "negative";
  return "none";
}

/**
 * Generic correlation detector: align the two series, gate on n, correlate, and let the
 * caller phrase the finding. Returns null when there aren't enough paired days or the
 * correlation is undefined (a flat series).
 */
function correlate(opts: {
  id: string;
  title: string;
  x: DayValue[];
  y: DayValue[];
  lagDays?: number;
  windowDays: number;
  describe: (r: number, n: number) => string;
}): Observation | null {
  const pairs = alignByDay(opts.x, opts.y, opts.lagDays ?? 0);
  const n = pairs.length;
  if (n < MIN_PAIRED_DAYS) return null;

  const r = pearson(pairs);
  if (r === null) return null;

  return {
    id: opts.id,
    title: opts.title,
    finding: opts.describe(r, n),
    direction: directionOf(r),
    strength: r,
    n,
    windowDays: opts.windowDays,
  };
}

/**
 * Late-caffeine nights vs that night's sleep score. Caffeine logged at/after the
 * configured hour on day D is paired with Oura's sleep score for D+1 — the sleep that
 * began that night (Oura dates a sleep period to the morning it ends). Reports the
 * point-biserial correlation as `strength` AND the mean sleep-score split for a legible
 * finding. Null when the flag never varies in the window (all-late or all-quiet).
 */
export function lateCaffeineVsSleep(
  lateFlags: DayFlag[],
  sleepScore: DayValue[],
  windowDays: number,
  lateHour: number,
): Observation | null {
  const x: DayValue[] = lateFlags.map((f) => ({
    day: f.day,
    value: f.flag ? 1 : 0,
  }));
  const pairs = alignByDay(x, sleepScore, 1);
  const n = pairs.length;
  if (n < MIN_PAIRED_DAYS) return null;

  const r = pearson(pairs);
  if (r === null) return null; // no contrast ⇒ nothing to compare

  const late = pairs.filter(([flag]) => flag === 1).map(([, s]) => s);
  const notLate = pairs.filter(([flag]) => flag === 0).map(([, s]) => s);
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  // Negative ⇒ sleep tends to be lower on late-caffeine nights. Its sign always matches
  // r's (point-biserial), so the direction stays consistent with `strength`.
  const diff = mean(late) - mean(notLate);
  const word = diff < 0 ? "lower" : "higher";

  return {
    id: "late-caffeine-sleep",
    title: "Late caffeine vs sleep",
    finding:
      `Sleep score tends to be ~${Math.abs(Math.round(diff))} ${word} on nights after ` +
      `caffeine logged at/after ${lateHour}:00 than on other nights (n=${n} nights). ` +
      `Hypothesis, not proof.`,
    direction: directionOf(diff),
    strength: r,
    n,
    windowDays,
  };
}

/** Sleep score vs the NEXT day's readiness (lag +1). */
export function sleepVsNextDayReadiness(
  sleepScore: DayValue[],
  readiness: DayValue[],
  windowDays: number,
): Observation | null {
  return correlate({
    id: "sleep-next-readiness",
    title: "Sleep vs next-day readiness",
    x: sleepScore,
    y: readiness,
    lagDays: 1,
    windowDays,
    describe: (r, n) =>
      `Higher sleep scores tend to be followed by ${r >= 0 ? "higher" : "lower"} ` +
      `next-day readiness (r=${fmtR(r)}, n=${n}). Correlation, not cause.`,
  });
}

/** Same-day readiness vs lifting volume (lag 0; only days with a logged session pair). */
export function readinessVsLiftingVolume(
  readiness: DayValue[],
  liftingVolume: DayValue[],
  windowDays: number,
): Observation | null {
  return correlate({
    id: "readiness-lifting",
    title: "Readiness vs lifting volume",
    x: readiness,
    y: liftingVolume,
    lagDays: 0,
    windowDays,
    describe: (r, n) =>
      `On higher-readiness days you tend to log ${r >= 0 ? "more" : "less"} lifting ` +
      `volume (r=${fmtR(r)}, n=${n} training days). Correlation, not cause.`,
  });
}

/**
 * The 7-day weight average vs the daily sleep score (lag 0). Both series are smoothed, so
 * adjacent days are autocorrelated and n overstates the independent sample — the finding
 * is worded loosely on purpose.
 */
export function weightTrendVsSleep(
  weight7dAvg: DayValue[],
  sleepScore: DayValue[],
  windowDays: number,
): Observation | null {
  return correlate({
    id: "weight-sleep",
    title: "Weight trend vs sleep",
    x: weight7dAvg,
    y: sleepScore,
    lagDays: 0,
    windowDays,
    describe: (r, n) =>
      `Your 7-day weight average tends to move ${r >= 0 ? "with" : "opposite to"} your ` +
      `sleep score (r=${fmtR(r)}, n=${n} days). A loose hypothesis, not proof.`,
  });
}
