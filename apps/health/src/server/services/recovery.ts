import { shiftDay, todayLocal } from "@/lib/dates";
import {
  currentEpisodeStart,
  type DailyStatus,
  deviationFlag,
  type Direction,
  type Flag,
  recoveryStatus,
  type RecoveryStatus,
  rollingBaseline,
  zScore,
} from "@/lib/recovery";
import { prisma } from "@/server/db";

// Extra days of history loaded beyond the baseline window so each recent day can be scored
// against its OWN trailing baseline — that per-day status trace is what locates the current
// episode for the push dedupe.
const LOOKBACK_DAYS = 14;

/** The single caveat string echoed by the card, the MCP tool, and the push copy. */
export const RECOVERY_CAVEAT = "Trend signal, not medical advice.";

type MetricKey = "restingHr" | "hrv" | "tempDeviation";

interface MetricMeta {
  key: MetricKey;
  label: string;
  unit: string;
  /** Which way is the *bad* direction (the one we warn on). */
  direction: Direction;
}

// Resting HR = the night's lowest HR (bpm); HRV = the main sleep's average HRV (ms); both come
// from sleep_sessions. Temperature deviation (°C) is Oura's own readiness deviation. NOTE we do
// NOT use DailyReadiness.restingHrBpm / hrvBalance — those hold Oura's 0–100 contributor scores,
// not raw bpm / ms.
const METRICS: readonly MetricMeta[] = [
  { key: "restingHr", label: "Resting HR", unit: "bpm", direction: "high-bad" },
  { key: "hrv", label: "HRV", unit: "ms", direction: "low-bad" },
  { key: "tempDeviation", label: "Temp deviation", unit: "°C", direction: "high-bad" },
] as const;

/** One day's value for one metric (null = no reading that day). */
export interface SeriesPoint {
  day: string;
  value: number | null;
}

/** A metric's recovery read for the requested day, plus its recent series for a sparkline. */
export interface MetricRecovery {
  label: string;
  unit: string;
  direction: Direction;
  /** Trailing `window` days up to and including the requested day. */
  series: SeriesPoint[];
  /** Rolling baseline (mean ± sd) from the prior window, or null when too little history. */
  baseline: { mean: number; sd: number } | null;
  /** The requested day's value, or null when not synced. */
  today: number | null;
  /** Signed z-score of today vs baseline (rounded), or null when it can't be computed. */
  z: number | null;
  flag: Flag;
}

export interface RecoveryResult {
  day: string;
  window: number;
  metrics: Record<MetricKey, MetricRecovery>;
  /** Overall read for the requested day. */
  status: RecoveryStatus;
  /** First civil day of the current under-recovery episode (for dedupe), or null. */
  episodeStart: string | null;
  caveat: string;
}

type DayMap = Map<string, number | null>;

/** A finite number or null; coerces Prisma's Decimal/bigint/string raw-query scalars. */
function num(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Prior (strictly-before-`day`) non-null values in chronological order. */
function priorValues(series: DayMap, days: string[], day: string): number[] {
  const out: number[] = [];
  for (const d of days) {
    if (d >= day) break; // YYYY-MM-DD sorts lexicographically
    const v = series.get(d);
    if (v != null) out.push(v);
  }
  return out;
}

/** Assess one metric for one day against its trailing baseline. */
function assess(
  series: DayMap,
  days: string[],
  day: string,
  window: number,
  dir: Direction,
): { flag: Flag; baseline: { mean: number; sd: number } | null; today: number | null; z: number | null } {
  const today = series.get(day) ?? null;
  const baseline = rollingBaseline(priorValues(series, days, day), window);
  // No baseline OR no reading today → can't judge this metric.
  if (baseline == null || today == null) {
    return { flag: "insufficient", baseline: baseline && { mean: baseline.mean, sd: baseline.sd }, today, z: null };
  }
  const z = zScore(today, baseline);
  return {
    flag: deviationFlag(today, baseline, dir),
    baseline: { mean: baseline.mean, sd: baseline.sd },
    today,
    z: z == null ? null : Math.round(z * 100) / 100,
  };
}

/**
 * The recovery snapshot for `day`: resting HR, HRV and body-temperature deviation each scored
 * against a `window`-day rolling baseline (a per-metric flag), combined into one status, plus
 * the current episode's start day for push deduping. A TREND SIGNAL only — never a diagnosis
 * (CLAUDE.md guardrails). An insufficient baseline yields no flag and no episode.
 */
export async function getRecovery(
  day: string = todayLocal(),
  window = 30,
): Promise<RecoveryResult> {
  // Need `window` baseline days before the earliest lookback day, so reach back window+LOOKBACK.
  const start = shiftDay(day, -(window + LOOKBACK_DAYS));
  const days: string[] = [];
  for (let d = start; d <= day; d = shiftDay(d, 1)) days.push(d);

  // One row per civil day from the MAIN sleep session (longest), plus the readiness deviation.
  const [sleepRows, readinessRows] = await Promise.all([
    prisma.$queryRaw<{ day: string; lowest_hr_bpm: number | null; avg_hrv_ms: number | null }[]>`
      SELECT DISTINCT ON (day) day::text AS day, lowest_hr_bpm, avg_hrv_ms
      FROM sleep_sessions
      WHERE day BETWEEN ${start}::date AND ${day}::date
      ORDER BY day, total_sleep_min DESC
    `,
    prisma.$queryRaw<{ day: string; temperature_deviation: unknown }[]>`
      SELECT day::text AS day, temperature_deviation
      FROM daily_readiness
      WHERE day BETWEEN ${start}::date AND ${day}::date
    `,
  ]);

  const seriesByKey: Record<MetricKey, DayMap> = {
    restingHr: new Map(sleepRows.map((r) => [r.day, num(r.lowest_hr_bpm)])),
    hrv: new Map(sleepRows.map((r) => [r.day, num(r.avg_hrv_ms)])),
    tempDeviation: new Map(readinessRows.map((r) => [r.day, num(r.temperature_deviation)])),
  };

  // Per-day overall status across the recent lookback → the current episode's start day.
  const lookbackStart = shiftDay(day, -(LOOKBACK_DAYS - 1));
  const statuses: DailyStatus[] = days
    .filter((d) => d >= lookbackStart)
    .map((d) => ({
      day: d,
      status: recoveryStatus({
        restingHr: assess(seriesByKey.restingHr, days, d, window, "high-bad").flag,
        hrv: assess(seriesByKey.hrv, days, d, window, "low-bad").flag,
        tempDeviation: assess(seriesByKey.tempDeviation, days, d, window, "high-bad").flag,
      }),
    }));
  const episodeStart = currentEpisodeStart(statuses, day);

  // Today's detailed per-metric read + a trailing-window series for the sparkline.
  const seriesStart = shiftDay(day, -(window - 1));
  const seriesDays = days.filter((d) => d >= seriesStart);
  const metrics = {} as Record<MetricKey, MetricRecovery>;
  for (const meta of METRICS) {
    const series = seriesByKey[meta.key];
    const a = assess(series, days, day, window, meta.direction);
    metrics[meta.key] = {
      label: meta.label,
      unit: meta.unit,
      direction: meta.direction,
      series: seriesDays.map((d) => ({ day: d, value: series.get(d) ?? null })),
      baseline: a.baseline,
      today: a.today,
      z: a.z,
      flag: a.flag,
    };
  }

  return {
    day,
    window,
    metrics,
    status: recoveryStatus({
      restingHr: metrics.restingHr.flag,
      hrv: metrics.hrv.flag,
      tempDeviation: metrics.tempDeviation.flag,
    }),
    episodeStart,
    caveat: RECOVERY_CAVEAT,
  };
}
