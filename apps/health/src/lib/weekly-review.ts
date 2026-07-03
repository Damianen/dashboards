// Pure this-week-vs-last-week aggregation for the weekly review. No I/O and no
// date math: rows are one week's daily_summary rows (civil days, Europe/
// Amsterdam — the service does all week arithmetic via mondayOf/shiftDay).
// Honesty rules (CLAUDE.md) hold throughout: active_kcal is never read, intake
// is never netted against expenditure, and a metric with no data stays null
// rather than pretending zero.

import type { DailySummary } from "@/server/services/summary";

/**
 * One week's aggregates. Null semantics:
 * - Averages/sums cover only the days where the metric is present; when NO day
 *   has it, the figure is null ("no data"), never 0.
 * - Row-derived day counts (trainingDays, daysLogged, daysMetTarget) are null
 *   only when the week has no daily_summary rows at all (an entirely unknown
 *   week); with rows present a count of 0 is a real answer.
 * - daysElapsed, the consistency counts, and the targets come from the caller
 *   (see SummarizeWeekOpts) and pass through unchanged.
 */
export interface WeekAggregates {
  training: {
    /** Σ working-set volume (kg) over the week, or null when no day has any. */
    volumeKg: number | null;
    /** Σ working sets over the week, or null when no day has any. */
    workingSets: number | null;
    /** Days with at least one working set or any lifting volume. */
    trainingDays: number | null;
  };
  sleep: {
    avgScore: number | null;
    avgDurationMin: number | null;
  };
  readiness: {
    avgScore: number | null;
  };
  weight: {
    /** LAST available 7-day weight average in the week (same semantics as the
     *  weekly push) — a denoised point-in-time read, never an in-week mean. */
    lastWeight7dAvg: number | null;
  };
  intake: {
    /** Mean over LOGGED days only — unlogged days never dilute the average. */
    avgKcal: number | null;
    avgProteinG: number | null;
    avgFiberG: number | null;
    /** Days with any logged intake. */
    daysLogged: number | null;
    /** Standing intake-ONLY calorie target in force (context, not a delta —
     *  and never netted against expenditure, CLAUDE.md). */
    kcalTarget: number | null;
    /** Standing protein target (latest weight × g/kg), or null without a weight. */
    proteinTargetG: number | null;
  };
  water: {
    /** Days where logged water reached that day's target (waterMl ≥ waterTargetMl). */
    daysMetTarget: number | null;
    /** Adherence denominator: 7 for past weeks; Monday..today inclusive for the
     *  current (partial) week. */
    daysElapsed: number;
    totalMl: number | null;
  };
  consistency: {
    /** Days with at least one food entry (service-counted over the range). */
    foodLoggedDays: number;
    /** Days where every currently-active supplement was checked. */
    supplementCompleteDays: number;
  };
}

/** Week-over-week differences (current − previous), null whenever the metric is
 *  absent in either week — an unknown side never fakes a delta. daysElapsed and
 *  the standing targets are denominators/context, not comparable metrics. */
export interface WeeklyDeltas {
  training: {
    volumeKg: number | null;
    workingSets: number | null;
    trainingDays: number | null;
  };
  sleep: {
    avgScore: number | null;
    avgDurationMin: number | null;
  };
  readiness: {
    avgScore: number | null;
  };
  weight: {
    lastWeight7dAvg: number | null;
  };
  intake: {
    avgKcal: number | null;
    avgProteinG: number | null;
    avgFiberG: number | null;
    daysLogged: number | null;
  };
  water: {
    daysMetTarget: number | null;
    totalMl: number | null;
  };
  consistency: {
    foodLoggedDays: number | null;
    supplementCompleteDays: number | null;
  };
}

/** A single-day highlight (e.g. the week's best sleep score). */
export interface Callout {
  /** Civil day ("YYYY-MM-DD") the extreme fell on. */
  day: string;
  /** Human label for the metric, e.g. "Sleep score". */
  label: string;
  value: number;
}

/** Caller-supplied context for summarizeWeek — everything the rows alone can't say. */
export interface SummarizeWeekOpts {
  /** Civil days of the week that have elapsed: 7 for past weeks; for the current
   *  week, Monday through today inclusive (capped at 7). */
  elapsedDays: number;
  /** Standing protein target (g), or null when no weight exists to derive one. */
  proteinTargetG: number | null;
  /** Configured daily intake target (kcal), or null when unset. */
  intakeKcalTarget: number | null;
  /** Days in the week's range with at least one food entry. */
  foodLoggedDays: number;
  /** Days in the week's range where every currently-active supplement was checked. */
  supplementCompleteDays: number;
}

/** Numeric daily_summary metrics — every column except the day itself. */
export type SummaryMetricKey = Exclude<keyof DailySummary, "day">;

function presentValues(rows: DailySummary[], key: SummaryMetricKey): number[] {
  return rows.map((r) => r[key]).filter((v): v is number => v != null);
}

/** Mean over the days where the metric is present; null when none has it. */
function avgOf(rows: DailySummary[], key: SummaryMetricKey): number | null {
  const values = presentValues(rows, key);
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Sum over the days where the metric is present; null when none has it. */
function sumOf(rows: DailySummary[], key: SummaryMetricKey): number | null {
  const values = presentValues(rows, key);
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0);
}

/** The metric's value on the LATEST day that has one, or null. Order-independent. */
function lastOf(rows: DailySummary[], key: SummaryMetricKey): number | null {
  let best: { day: string; value: number } | null = null;
  for (const row of rows) {
    const value = row[key];
    if (value == null) continue;
    if (best === null || row.day > best.day) best = { day: row.day, value };
  }
  return best?.value ?? null;
}

/**
 * Reduce one week's daily_summary rows (any order; gaps allowed) to its
 * aggregates. Day-count adherence reads use opts.elapsedDays as denominator so
 * the current partial week is never judged against days that haven't happened.
 */
export function summarizeWeek(
  rows: DailySummary[],
  opts: SummarizeWeekOpts,
): WeekAggregates {
  // No rows at all = an entirely unknown week: counts are null, not 0.
  const countDays = (pred: (r: DailySummary) => boolean): number | null =>
    rows.length === 0 ? null : rows.filter(pred).length;

  return {
    training: {
      volumeKg: sumOf(rows, "liftingVolumeKg"),
      workingSets: sumOf(rows, "workingSets"),
      trainingDays: countDays(
        (r) => (r.liftingVolumeKg ?? 0) > 0 || (r.workingSets ?? 0) > 0,
      ),
    },
    sleep: {
      avgScore: avgOf(rows, "sleepScore"),
      avgDurationMin: avgOf(rows, "totalSleepMin"),
    },
    readiness: {
      avgScore: avgOf(rows, "readinessScore"),
    },
    weight: {
      lastWeight7dAvg: lastOf(rows, "weight7dAvg"),
    },
    intake: {
      avgKcal: avgOf(rows, "intakeKcal"),
      avgProteinG: avgOf(rows, "proteinG"),
      avgFiberG: avgOf(rows, "fiberG"),
      daysLogged: countDays((r) => r.intakeKcal != null),
      kcalTarget: opts.intakeKcalTarget,
      proteinTargetG: opts.proteinTargetG,
    },
    water: {
      daysMetTarget: countDays(
        (r) =>
          r.waterMl != null &&
          r.waterTargetMl != null &&
          r.waterMl >= r.waterTargetMl,
      ),
      daysElapsed: opts.elapsedDays,
      totalMl: sumOf(rows, "waterMl"),
    },
    consistency: {
      foodLoggedDays: opts.foodLoggedDays,
      supplementCompleteDays: opts.supplementCompleteDays,
    },
  };
}

/** current − previous when both sides exist, else null (never fake a delta). */
function deltaOf(current: number | null, previous: number | null): number | null {
  return current != null && previous != null ? current - previous : null;
}

/** Null-safe week-over-week deltas: any metric absent in either week stays null. */
export function compareWeeks(
  current: WeekAggregates,
  previous: WeekAggregates,
): WeeklyDeltas {
  return {
    training: {
      volumeKg: deltaOf(current.training.volumeKg, previous.training.volumeKg),
      workingSets: deltaOf(
        current.training.workingSets,
        previous.training.workingSets,
      ),
      trainingDays: deltaOf(
        current.training.trainingDays,
        previous.training.trainingDays,
      ),
    },
    sleep: {
      avgScore: deltaOf(current.sleep.avgScore, previous.sleep.avgScore),
      avgDurationMin: deltaOf(
        current.sleep.avgDurationMin,
        previous.sleep.avgDurationMin,
      ),
    },
    readiness: {
      avgScore: deltaOf(current.readiness.avgScore, previous.readiness.avgScore),
    },
    weight: {
      lastWeight7dAvg: deltaOf(
        current.weight.lastWeight7dAvg,
        previous.weight.lastWeight7dAvg,
      ),
    },
    intake: {
      avgKcal: deltaOf(current.intake.avgKcal, previous.intake.avgKcal),
      avgProteinG: deltaOf(
        current.intake.avgProteinG,
        previous.intake.avgProteinG,
      ),
      avgFiberG: deltaOf(current.intake.avgFiberG, previous.intake.avgFiberG),
      daysLogged: deltaOf(current.intake.daysLogged, previous.intake.daysLogged),
    },
    water: {
      daysMetTarget: deltaOf(
        current.water.daysMetTarget,
        previous.water.daysMetTarget,
      ),
      totalMl: deltaOf(current.water.totalMl, previous.water.totalMl),
    },
    consistency: {
      foodLoggedDays: deltaOf(
        current.consistency.foodLoggedDays,
        previous.consistency.foodLoggedDays,
      ),
      supplementCompleteDays: deltaOf(
        current.consistency.supplementCompleteDays,
        previous.consistency.supplementCompleteDays,
      ),
    },
  };
}

// Friendly labels for the callout metrics in use; anything else falls back to
// its column key (still meaningful to an agent).
const CALLOUT_LABELS: Partial<Record<SummaryMetricKey, string>> = {
  sleepScore: "Sleep score",
  liftingVolumeKg: "Lifting volume",
  readinessScore: "Readiness",
};

/**
 * The day the metric peaked (`max`) or bottomed (`min`) within the rows, or
 * null when no day has a value. Ties go to the EARLIEST day — deterministic and
 * independent of row order.
 */
export function pickExtreme(
  rows: DailySummary[],
  metric: SummaryMetricKey,
  direction: "max" | "min",
): Callout | null {
  let best: { day: string; value: number } | null = null;
  for (const row of rows) {
    const value = row[metric];
    if (value == null) continue;
    const wins =
      best === null ||
      (direction === "max" ? value > best.value : value < best.value) ||
      (value === best.value && row.day < best.day);
    if (wins) best = { day: row.day, value };
  }
  if (best === null) return null;
  return { day: best.day, label: CALLOUT_LABELS[metric] ?? metric, value: best.value };
}
