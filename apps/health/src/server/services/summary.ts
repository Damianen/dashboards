import { Prisma } from "@/generated/prisma/client";
import { dayOf, dayToDbDate, todayLocal } from "@/lib/dates";
import type { TrendMetric } from "@/lib/schemas/summary";
import { prisma } from "@/server/db";

/**
 * One row of the daily_summary view. The view's aggregates are Postgres
 * numeric/bigint, which the driver hands back as strings/BigInt — so every
 * numeric column is coerced to a real `number | null` via num().
 */
export interface DailySummary {
  day: string;
  weightKg: number | null;
  weight7dAvg: number | null;
  sleepScore: number | null;
  readinessScore: number | null;
  totalSleepMin: number | null;
  activeKcal: number | null;
  steps: number | null;
  intakeKcal: number | null;
  proteinG: number | null;
  carbG: number | null;
  fatG: number | null;
  waterMl: number | null;
  waterTargetMl: number | null;
  stimulantMg: number | null;
  /** Unified caffeine total (mg) for the day: stimulant entries + food entries
   *  (incl. meal-logged) + checked supplements. This is what drives the water target. */
  caffeineMg: number | null;
  liftingVolumeKg: number | null;
  workingSets: number | null;
  supplementsTaken: number | null;
  /** Body composition (latest Withings measurement of the day). */
  bodyFatPct: number | null;
  muscleMassKg: number | null;
  /** Sleep depth (summed across the day's sessions). */
  deepMin: number | null;
  remMin: number | null;
  /** Recovery signals from sleep: HRV averaged, resting HR as the night's lowest. */
  hrvMs: number | null;
  restingHrBpm: number | null;
  /** Logged dietary fiber (g). */
  fiberG: number | null;
}

type RawSummaryRow = Record<keyof DailySummary, unknown>;

function num(v: unknown): number | null {
  return v == null ? null : Number(v);
}

function mapRow(r: RawSummaryRow): DailySummary {
  return {
    day: String(r.day),
    weightKg: num(r.weightKg),
    weight7dAvg: num(r.weight7dAvg),
    sleepScore: num(r.sleepScore),
    readinessScore: num(r.readinessScore),
    totalSleepMin: num(r.totalSleepMin),
    activeKcal: num(r.activeKcal),
    steps: num(r.steps),
    intakeKcal: num(r.intakeKcal),
    proteinG: num(r.proteinG),
    carbG: num(r.carbG),
    fatG: num(r.fatG),
    waterMl: num(r.waterMl),
    waterTargetMl: num(r.waterTargetMl),
    stimulantMg: num(r.stimulantMg),
    caffeineMg: num(r.caffeineMg),
    liftingVolumeKg: num(r.liftingVolumeKg),
    workingSets: num(r.workingSets),
    supplementsTaken: num(r.supplementsTaken),
    bodyFatPct: num(r.bodyFatPct),
    muscleMassKg: num(r.muscleMassKg),
    deepMin: num(r.deepMin),
    remMin: num(r.remMin),
    hrvMs: num(r.hrvMs),
    restingHrBpm: num(r.restingHrBpm),
    fiberG: num(r.fiberG),
  };
}

/**
 * [sql expression in the view, camelCase alias] — one entry per daily_summary
 * column, in DailySummary key order (NOT the view's column order: the view is
 * append-only, so late additions like caffeine_mg sit at its end). This is the
 * single list the raw SELECT is built from; summary-seam.test.ts pins it
 * against the canonical view SQL (prisma/views/daily_summary.sql), and the
 * types pin it against DailySummary.
 */
export const SUMMARY_COLUMNS = [
  ["day::text", "day"],
  ["weight_kg", "weightKg"],
  ["weight_7d_avg", "weight7dAvg"],
  ["sleep_score", "sleepScore"],
  ["readiness_score", "readinessScore"],
  ["total_sleep_min", "totalSleepMin"],
  ["active_kcal", "activeKcal"],
  ["steps", "steps"],
  ["intake_kcal", "intakeKcal"],
  ["protein_g", "proteinG"],
  ["carb_g", "carbG"],
  ["fat_g", "fatG"],
  ["water_ml", "waterMl"],
  ["water_target_ml", "waterTargetMl"],
  ["stimulant_mg", "stimulantMg"],
  ["caffeine_mg", "caffeineMg"],
  ["lifting_volume_kg", "liftingVolumeKg"],
  ["working_sets", "workingSets"],
  ["supplements_taken", "supplementsTaken"],
  ["body_fat_pct", "bodyFatPct"],
  ["muscle_mass_kg", "muscleMassKg"],
  ["deep_min", "deepMin"],
  ["rem_min", "remMin"],
  ["hrv_ms", "hrvMs"],
  ["resting_hr_bpm", "restingHrBpm"],
  ["fiber_g", "fiberG"],
] as const satisfies ReadonlyArray<readonly [string, keyof DailySummary]>;

// Compile-time: every DailySummary key has an alias (satisfies covers the reverse).
type SummaryAlias = (typeof SUMMARY_COLUMNS)[number][1];
type AssertAllKeysCovered = keyof DailySummary extends SummaryAlias
  ? true
  : never;
const _allKeysCovered: AssertAllKeysCovered = true;
void _allKeysCovered;

// Constant, built from the list above — never user-controlled, safe for Prisma.raw.
const SUMMARY_SELECT = SUMMARY_COLUMNS.map(
  ([sql, alias]) => `${sql} AS "${alias}"`,
).join(", ");

/** The daily_summary row for a civil day, or null if no source data exists yet. */
export async function getDailySummary(
  day: string = todayLocal(),
): Promise<DailySummary | null> {
  const rows = await prisma.$queryRaw<RawSummaryRow[]>(
    Prisma.sql`
      SELECT ${Prisma.raw(SUMMARY_SELECT)}
      FROM daily_summary
      WHERE day = ${day}::date
    `,
  );
  const row = rows[0];
  return row ? mapRow(row) : null;
}

// Maps a validated trend metric to its daily_summary column. Constant + keyed by the
// validated enum, so the value is never user-controlled — safe for Prisma.raw.
// Exported for summary-seam.test.ts, which pins the values against the view SQL.
export const TREND_COLUMNS: Record<TrendMetric, string> = {
  weight: "weight_kg",
  weight_7d_avg: "weight_7d_avg",
  sleep_score: "sleep_score",
  readiness: "readiness_score",
  active_kcal: "active_kcal",
  steps: "steps",
  intake_kcal: "intake_kcal",
  protein_g: "protein_g",
  water_ml: "water_ml",
  water_target_ml: "water_target_ml",
  // The Caffeine trend now shows the UNIFIED daily total (stimulants + food +
  // supplements), not just stimulant entries.
  caffeine_mg: "caffeine_mg",
  lifting_volume_kg: "lifting_volume_kg",
  total_sleep_min: "total_sleep_min",
  deep_min: "deep_min",
  rem_min: "rem_min",
  hrv_ms: "hrv_ms",
  resting_hr_bpm: "resting_hr_bpm",
  body_fat_pct: "body_fat_pct",
  muscle_mass_kg: "muscle_mass_kg",
  fiber_g: "fiber_g",
};

export interface TrendPoint {
  day: string;
  value: number;
}

/** A single metric's series over the last `days` days (ending today); missing days omitted. */
export async function getTrends(
  metric: TrendMetric,
  days: number,
): Promise<TrendPoint[]> {
  const column = Prisma.raw(TREND_COLUMNS[metric]);
  const end = todayLocal();
  const start = dayOf(
    new Date(dayToDbDate(end).getTime() - (days - 1) * 86_400_000),
  );
  const rows = await prisma.$queryRaw<{ day: string; value: unknown }[]>(
    Prisma.sql`
      SELECT day::text AS "day", ${column} AS "value"
      FROM daily_summary
      WHERE day BETWEEN ${start}::date AND ${end}::date
        AND ${column} IS NOT NULL
      ORDER BY day
    `,
  );
  return rows.map((r) => ({ day: String(r.day), value: Number(r.value) }));
}
