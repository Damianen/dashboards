// Empirical TDEE (true maintenance calories) derived from REALITY: the body's own
// mass-balance trend regressed against logged intake over a rolling window. This is
// the HONEST energy balance — the weight-derived term is inferred from measured
// weight change, NEVER from a wearable's active-calorie estimate, and intake is NEVER
// netted against any device figure (see CLAUDE.md domain guardrails). Pure and
// side-effect-free: the service feeds it data; this module does no I/O.

import { dayToDbDate } from "@/lib/dates";

/**
 * Energy density of body-mass change, kcal per kg. The classic 7700 figure is a
 * modeling assumption (and itself approximate), not a fact — exported so tests can
 * pin it and callers can see the constant they're trusting.
 */
export const KCAL_PER_KG = 7700;

export interface WeightPoint {
  /** Civil day "YYYY-MM-DD" (Europe/Amsterdam, already bucketed upstream). */
  day: string;
  weightKg: number;
}

export interface IntakeDay {
  day: string;
  kcal: number;
  /** True only when the day actually has food entries; false marks a missing log. */
  logged: boolean;
}

export interface TdeeEstimate {
  /** Maintenance kcal/day, or null when not estimable (see estimateTDEE). */
  tdee: number | null;
  /** Mean intake over LOGGED days only (null when nothing was logged). */
  meanIntake: number | null;
  /** Weight trend, kg per week (positive = gaining, negative = losing). */
  slopeKgPerWeek: number;
  /** Calendar days in the window. */
  nDays: number;
  /** Days within the window that have food entries. */
  nLoggedDays: number;
  /** nLoggedDays / nDays — the logging-completeness fraction. */
  completeness: number;
}

export type Confidence = "low" | "medium" | "high";

// dayToDbDate anchors a civil day at UTC midnight, so this is exact integer-day
// arithmetic — no timezone parse, no DST trap. Only relative offsets matter here
// (the regression mean-centers x), so the 1970 epoch origin is irrelevant.
function dayIndex(day: string): number {
  return Math.round(dayToDbDate(day).getTime() / 86_400_000);
}

/**
 * Least-squares slope of weight over time, in kg per WEEK. Regresses weightKg against
 * each point's real calendar-day offset, so irregular/missing weigh-ins are weighted
 * by their true spacing. x and y are mean-centered before the normal equations to
 * avoid catastrophic cancellation at ~20,000-day epoch offsets. Returns 0 when fewer
 * than 2 DISTINCT days are present (the slope is then undefined; callers gate on the
 * point count for estimability).
 */
export function weightTrendKgPerWeek(points: WeightPoint[]): number {
  const pts = points.map((p) => ({ x: dayIndex(p.day), y: p.weightKg }));
  if (new Set(pts.map((p) => p.x)).size < 2) return 0;

  const n = pts.length;
  let xMean = 0;
  let yMean = 0;
  for (const p of pts) {
    xMean += p.x;
    yMean += p.y;
  }
  xMean /= n;
  yMean /= n;

  let num = 0;
  let den = 0;
  for (const p of pts) {
    const dx = p.x - xMean;
    num += dx * (p.y - yMean);
    den += dx * dx;
  }
  if (den === 0) return 0; // redundant with the distinct-x guard, kept for safety
  return (num / den) * 7;
}

/**
 * Empirical maintenance from intake + weight trend ONLY.
 *   maintenance = meanIntakeOverLoggedDays − (slopeKgPerWeek / 7) × kcalPerKg
 * Losing weight (slope < 0) ⇒ maintenance > intake; gaining ⇒ maintenance < intake.
 * `tdee` is null when the data can't support an estimate: no logged days (no mean
 * intake) or fewer than 2 distinct weigh-in days (no definable slope). `meanIntake`
 * is still returned whenever any day was logged, so the card stays legible.
 */
export function estimateTDEE({
  dailyIntake,
  weightPoints,
  kcalPerKg = KCAL_PER_KG,
}: {
  dailyIntake: IntakeDay[];
  weightPoints: WeightPoint[];
  kcalPerKg?: number;
}): TdeeEstimate {
  const nDays = dailyIntake.length;
  const logged = dailyIntake.filter((d) => d.logged);
  const nLoggedDays = logged.length;
  const completeness = nDays === 0 ? 0 : nLoggedDays / nDays;

  const slopeKgPerWeek = weightTrendKgPerWeek(weightPoints);
  const distinctWeightDays = new Set(weightPoints.map((p) => p.day)).size;

  const meanIntake =
    nLoggedDays > 0
      ? logged.reduce((sum, d) => sum + d.kcal, 0) / nLoggedDays
      : null;

  const tdee =
    meanIntake === null || distinctWeightDays < 2
      ? null
      : meanIntake - (slopeKgPerWeek / 7) * kcalPerKg;

  return { tdee, meanIntake, slopeKgPerWeek, nDays, nLoggedDays, completeness };
}

/**
 * Confidence in the estimate, driven by LOGGING COMPLETENESS (not just day count) —
 * missing food days bias TDEE high, so under-logging caps confidence at "low". A
 * |slope| > 1.5 kg/week implies a >1650 kcal/day imbalance, almost always water/noise
 * over a short window, so it is never presented as confident.
 */
export function confidenceLevel({
  nLoggedDays,
  completeness,
  weightPointCount,
  slopeKgPerWeek,
}: {
  nLoggedDays: number;
  completeness: number;
  weightPointCount: number;
  slopeKgPerWeek: number;
}): Confidence {
  if (
    completeness < 0.7 ||
    nLoggedDays < 10 ||
    weightPointCount < 4 ||
    Math.abs(slopeKgPerWeek) > 1.5
  ) {
    return "low";
  }
  if (completeness >= 0.85 && nLoggedDays >= 18 && weightPointCount >= 8) {
    return "high";
  }
  return "medium";
}
