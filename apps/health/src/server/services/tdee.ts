import type { TdeeWindow } from "@/lib/schemas/insights";
import { shiftDay, todayLocal } from "@/lib/dates";
import {
  confidenceLevel,
  estimateTDEE,
  type Confidence,
  type IntakeDay,
  type WeightPoint,
} from "@/lib/tdee";
import { prisma } from "@/server/db";
import { getTdeeWindowDays } from "./settings";

// Only the columns TDEE is allowed to read from daily_summary. Deliberately EXCLUDES
// active_kcal / steps so wearable expenditure can never enter this code path
// (CLAUDE.md guardrail: TDEE is intake + weight trend only, never netted vs device).
interface RawTdeeRow {
  day: unknown;
  intakeKcal: unknown;
  weightKg: unknown;
  weight7dAvg: unknown;
}

function num(v: unknown): number | null {
  return v == null ? null : Number(v);
}

export interface TdeeEstimateResult {
  /** The rolling window used, in days. */
  window: TdeeWindow;
  /** Empirical maintenance kcal/day, or null when not estimable. */
  tdee: number | null;
  /** Mean intake over logged days only (the legible input behind `tdee`). */
  meanIntake: number | null;
  /** Weight trend, kg per week (negative = losing). */
  slopeKgPerWeek: number;
  nDays: number;
  nLoggedDays: number;
  completeness: number;
  weightPointCount: number;
  confidence: Confidence;
}

/**
 * Empirical maintenance calories for a rolling window, from intake + weight trend
 * ONLY. Pulls per-day intake (logged = the day actually has food entries) and weight
 * points (weight_7d_avg to denoise where available, else the raw daily weight) from
 * the daily_summary view, then runs the pure engine. Never reads or returns any
 * wearable active-calorie figure, and emits no net/deficit field.
 */
export async function getTdeeEstimate(
  window?: TdeeWindow,
): Promise<TdeeEstimateResult> {
  const windowDays = window ?? (await getTdeeWindowDays());
  const end = todayLocal();
  const start = shiftDay(end, -(windowDays - 1));

  const rows = await prisma.$queryRaw<RawTdeeRow[]>`
    SELECT
      day::text     AS "day",
      intake_kcal   AS "intakeKcal",
      weight_kg     AS "weightKg",
      weight_7d_avg AS "weight7dAvg"
    FROM daily_summary
    WHERE day BETWEEN ${start}::date AND ${end}::date
    ORDER BY day
  `;

  const byDay = new Map<string, RawTdeeRow>();
  for (const r of rows) byDay.set(String(r.day), r);

  // One intake entry per CALENDAR day in the window (missing-data days included, so
  // completeness reflects skipped logs). Weight points only for days with a value.
  const dailyIntake: IntakeDay[] = [];
  const weightPoints: WeightPoint[] = [];
  for (let i = 0; i < windowDays; i++) {
    const day = shiftDay(start, i);
    const row = byDay.get(day);
    const intakeKcal = row ? num(row.intakeKcal) : null;
    dailyIntake.push({ day, kcal: intakeKcal ?? 0, logged: intakeKcal != null });
    if (row) {
      const weightKg = num(row.weight7dAvg) ?? num(row.weightKg);
      if (weightKg != null) weightPoints.push({ day, weightKg });
    }
  }

  const estimate = estimateTDEE({ dailyIntake, weightPoints });
  const confidence = confidenceLevel({
    nLoggedDays: estimate.nLoggedDays,
    completeness: estimate.completeness,
    weightPointCount: weightPoints.length,
    slopeKgPerWeek: estimate.slopeKgPerWeek,
  });

  return {
    window: windowDays,
    ...estimate,
    weightPointCount: weightPoints.length,
    confidence,
  };
}
