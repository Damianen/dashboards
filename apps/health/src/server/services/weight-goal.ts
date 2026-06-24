import { shiftDay, todayLocal } from "@/lib/dates";
import { weightTrendKgPerWeek, type WeightPoint } from "@/lib/tdee";
import { projectGoalEta } from "@/lib/weight-goal";
import { prisma } from "@/server/db";
import { getWeightGoalKg } from "./settings";

// The weight-trend window for the projection. 30 days denoises day-to-day water
// swings while staying responsive; the slope reuses the same least-squares engine
// the TDEE estimate trusts (weightTrendKgPerWeek). Weight-trend ONLY — never device EE.
const GOAL_TREND_WINDOW_DAYS = 30;

export interface WeightGoalResult {
  /** Stored goal weight (kg), or null when unset. */
  goalKg: number | null;
  /** Latest denoised weight (7-day avg, else raw), or null with no weigh-ins. */
  currentKg: number | null;
  /** Weight trend, kg per week (negative = losing). */
  slopeKgPerWeek: number;
  /** Weeks to goal at the current trend; 0 if reached; null when not trending toward it. */
  weeksToGoal: number | null;
  /** Projected civil day the goal is reached, or null when there is no honest ETA. */
  etaDay: string | null;
  /** Whether the trend is moving toward the goal; null when goal or weight is unknown. */
  onTrack: boolean | null;
  windowDays: number;
}

/**
 * Body-weight goal status: the stored goal, the current denoised weight, the measured
 * weekly trend, and — when both a goal and a weight exist — a projected ETA from the
 * pure projectGoalEta engine. A flat or wrong-way trend yields no ETA rather than a
 * misleading one. Intake/weight-trend only; never nets against device expenditure.
 */
export async function getWeightGoal(): Promise<WeightGoalResult> {
  const windowDays = GOAL_TREND_WINDOW_DAYS;
  const end = todayLocal();
  const start = shiftDay(end, -(windowDays - 1));

  const [rows, goalKg] = await Promise.all([
    prisma.$queryRaw<
      { day: string; weightKg: unknown; weight7dAvg: unknown }[]
    >`
      SELECT day::text AS "day", weight_kg AS "weightKg", weight_7d_avg AS "weight7dAvg"
      FROM daily_summary
      WHERE day BETWEEN ${start}::date AND ${end}::date
      ORDER BY day
    `,
    getWeightGoalKg(),
  ]);

  const num = (v: unknown): number | null => (v == null ? null : Number(v));
  const points: WeightPoint[] = [];
  let currentKg: number | null = null;
  for (const r of rows) {
    // Prefer the 7-day average to denoise; fall back to the raw daily weight.
    const w = num(r.weight7dAvg) ?? num(r.weightKg);
    if (w != null) {
      points.push({ day: r.day, weightKg: w });
      currentKg = w; // rows are ascending, so the last non-null is the most recent
    }
  }
  const slopeKgPerWeek = weightTrendKgPerWeek(points);

  if (goalKg == null || currentKg == null) {
    return {
      goalKg,
      currentKg,
      slopeKgPerWeek,
      weeksToGoal: null,
      etaDay: null,
      onTrack: null,
      windowDays,
    };
  }

  const { weeksToGoal, onTrack } = projectGoalEta({
    currentKg,
    goalKg,
    slopeKgPerWeek,
  });
  const etaDay =
    weeksToGoal == null
      ? null
      : weeksToGoal <= 0
        ? end
        : shiftDay(end, Math.round(weeksToGoal * 7));

  return {
    goalKg,
    currentKg,
    slopeKgPerWeek,
    weeksToGoal,
    etaDay,
    onTrack,
    windowDays,
  };
}
