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

/** The daily_summary row for a civil day, or null if no source data exists yet. */
export async function getDailySummary(
  day: string = todayLocal(),
): Promise<DailySummary | null> {
  const rows = await prisma.$queryRaw<RawSummaryRow[]>`
    SELECT
      day::text         AS "day",
      weight_kg         AS "weightKg",
      weight_7d_avg     AS "weight7dAvg",
      sleep_score       AS "sleepScore",
      readiness_score   AS "readinessScore",
      total_sleep_min   AS "totalSleepMin",
      active_kcal       AS "activeKcal",
      steps             AS "steps",
      intake_kcal       AS "intakeKcal",
      protein_g         AS "proteinG",
      carb_g            AS "carbG",
      fat_g             AS "fatG",
      water_ml          AS "waterMl",
      water_target_ml   AS "waterTargetMl",
      stimulant_mg      AS "stimulantMg",
      caffeine_mg       AS "caffeineMg",
      lifting_volume_kg AS "liftingVolumeKg",
      working_sets      AS "workingSets",
      supplements_taken AS "supplementsTaken",
      body_fat_pct      AS "bodyFatPct",
      muscle_mass_kg    AS "muscleMassKg",
      deep_min          AS "deepMin",
      rem_min           AS "remMin",
      hrv_ms            AS "hrvMs",
      resting_hr_bpm    AS "restingHrBpm",
      fiber_g           AS "fiberG"
    FROM daily_summary
    WHERE day = ${day}::date
  `;
  const row = rows[0];
  return row ? mapRow(row) : null;
}

// Maps a validated trend metric to its daily_summary column. Constant + keyed by the
// validated enum, so the value is never user-controlled — safe for Prisma.raw.
const TREND_COLUMNS: Record<TrendMetric, string> = {
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
