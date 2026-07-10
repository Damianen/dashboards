// Goal-based calorie targets on top of the empirical TDEE — the SINGLE home of
// ALL target math (services orchestrate, this module computes; nothing here does
// I/O). Every rate uses the lib/tdee sign convention: kg per WEEK, positive =
// gaining, so a cut plans a negative rate and target = TDEE + rate × 7700 / 7.
// Targets derive from the empirical TDEE and the measured weight trend ONLY —
// never wearable/device calories, and intake is never netted against expenditure
// (CLAUDE.md domain guardrails).

import { daysBetween, shiftDay } from "@/lib/dates";
import { KCAL_PER_KG } from "@/lib/tdee";

/** Value-identical to the Prisma GoalPhase enum (kept string-literal so this
 *  module stays free of generated-client imports). */
export type GoalPhase = "CUT" | "BULK" | "MAINTAIN";

/** A goal within ±this of the current trend weight is a MAINTAIN phase. */
export const MAINTAIN_BAND_KG = 0.5;

/** Trend within ±this of the goal counts as reached (completion surfacing;
 *  mirrors lib/weight-goal's tolerance — avoids chasing scale noise). */
export const GOAL_REACHED_TOLERANCE_KG = 0.1;

/** Fixed relative bounds vs the current TDEE — deliberately constants, not
 *  settings: a deficit steeper than 25% or a surplus above 20% is never a sane
 *  single-user target regardless of preference. */
export const MAX_DEFICIT_PCT = 0.25;
export const MAX_SURPLUS_PCT = 0.2;

/** Targets are presented to the nearest 10 kcal — false precision otherwise. */
const ROUND_KCAL = 10;

/** Goal below trend − 0.5 = CUT, above + 0.5 = BULK, within the band = MAINTAIN
 *  (band edges inclusive). */
export function inferPhase(
  trendWeightKg: number,
  goalWeightKg: number,
): GoalPhase {
  const delta = goalWeightKg - trendWeightKg;
  if (Math.abs(delta) <= MAINTAIN_BAND_KG) return "MAINTAIN";
  return delta < 0 ? "CUT" : "BULK";
}

/** Fractional weeks from `from` (exclusive start of counting) to `targetDate`. */
export function weeksRemaining(from: string, targetDate: string): number {
  return daysBetween(from, targetDate) / 7;
}

/**
 * The rate the calendar demands, kg/week (positive = gaining; a cut comes out
 * negative). Precondition: weeksRemaining > 0 — callers gate on the target date
 * still being ahead.
 */
export function requiredRateKgPerWeek({
  trendWeightKg,
  goalWeightKg,
  weeksRemaining,
}: {
  trendWeightKg: number;
  goalWeightKg: number;
  weeksRemaining: number;
}): number {
  return (goalWeightKg - trendWeightKg) / weeksRemaining;
}

/** Safety caps as % of bodyweight per week (settings-overridable). */
export interface RateCaps {
  /** Max loss, e.g. 0.75 (% of BW per week). */
  maxLossPctBwPerWeek: number;
  /** Max gain, e.g. 0.5 (% of BW per week). */
  maxGainPctBwPerWeek: number;
}

export interface CappedRate {
  rateKgPerWeek: number;
  capped: boolean;
}

/**
 * Clamp a rate into [−lossCap% × BW, +gainCap% × BW]. The caps BIND THE DATE,
 * not vice versa: when the date demands more, the rate is clamped and the goal
 * simply lands later (see earliestRealisticDate).
 */
export function capRate(
  rateKgPerWeek: number,
  trendWeightKg: number,
  caps: RateCaps,
): CappedRate {
  const minRate = -(caps.maxLossPctBwPerWeek / 100) * trendWeightKg;
  const maxRate = (caps.maxGainPctBwPerWeek / 100) * trendWeightKg;
  const clamped = Math.min(maxRate, Math.max(minRate, rateKgPerWeek));
  return { rateKgPerWeek: clamped, capped: clamped !== rateKgPerWeek };
}

/**
 * The earliest honest completion day travelling at the full cap for the goal's
 * direction: ceil(|distance| / cap × 7) days after `startDay`. Meaningful when
 * the required rate was clamped; with the goal already within reach it returns
 * `startDay` itself.
 */
export function earliestRealisticDate({
  trendWeightKg,
  goalWeightKg,
  startDay,
  caps,
}: {
  trendWeightKg: number;
  goalWeightKg: number;
  startDay: string;
  caps: RateCaps;
}): string {
  const remainingKg = Math.abs(goalWeightKg - trendWeightKg);
  const capKgPerWeek =
    goalWeightKg < trendWeightKg
      ? (caps.maxLossPctBwPerWeek / 100) * trendWeightKg
      : (caps.maxGainPctBwPerWeek / 100) * trendWeightKg;
  if (capKgPerWeek <= 0 || remainingKg === 0) return startDay;
  return shiftDay(startDay, Math.ceil((remainingKg / capKgPerWeek) * 7));
}

/** Which bound ended up binding a computed target. */
export type BindingBound = "none" | "floor" | "maxDeficitPct" | "maxSurplusPct";

export interface TargetBounds {
  /** Absolute floor (setting, default 1500). */
  floorKcal: number;
  /** Pass MAX_DEFICIT_PCT. */
  maxDeficitPct: number;
  /** Pass MAX_SURPLUS_PCT. */
  maxSurplusPct: number;
}

export interface TargetResult {
  /** Rounded to the nearest 10 kcal; the floor is re-enforced after rounding. */
  targetKcal: number;
  bound: BindingBound;
}

/** Shared clamp-then-round: [max(floor, tdee×(1−deficit)), tdee×(1+surplus)],
 *  round to 10, floor re-enforced last (rounding may otherwise dip ≤5 under). */
function boundAndRound(
  rawKcal: number,
  tdeeKcal: number,
  bounds: TargetBounds,
): TargetResult {
  const deficitLimit = tdeeKcal * (1 - bounds.maxDeficitPct);
  const surplusLimit = tdeeKcal * (1 + bounds.maxSurplusPct);
  const lower = Math.max(bounds.floorKcal, deficitLimit);
  const lowerBound: BindingBound =
    bounds.floorKcal >= deficitLimit ? "floor" : "maxDeficitPct";

  let target = rawKcal;
  let bound: BindingBound = "none";
  if (target < lower) {
    target = lower;
    bound = lowerBound;
  } else if (target > surplusLimit) {
    target = surplusLimit;
    bound = "maxSurplusPct";
  }

  let rounded = Math.round(target / ROUND_KCAL) * ROUND_KCAL;
  if (rounded < bounds.floorKcal) {
    rounded = Math.ceil(bounds.floorKcal / ROUND_KCAL) * ROUND_KCAL;
    bound = "floor";
  }
  return { targetKcal: rounded, bound };
}

/**
 * Daily intake target for a rate: TDEE + rate × 7700 / 7, then the safety
 * bounds. A cut's negative rate lands below TDEE, a bulk's positive rate above.
 */
export function computeTarget(
  tdeeKcal: number,
  rateKgPerWeek: number,
  bounds: TargetBounds,
): TargetResult {
  const raw = tdeeKcal + (rateKgPerWeek * KCAL_PER_KG) / 7;
  return boundAndRound(raw, tdeeKcal, bounds);
}

/** Per-phase protein factors (g/kg bodyweight), settings-overridable. */
export interface PhaseProteinGPerKg {
  cut: number; // default 2.2
  maintain: number; // default 2.0
  bulk: number; // default 1.8
}

/** The protein g/kg factor for a phase. */
export function proteinGPerKg(
  phase: GoalPhase,
  overrides: PhaseProteinGPerKg,
): number {
  switch (phase) {
    case "CUT":
      return overrides.cut;
    case "MAINTAIN":
      return overrides.maintain;
    case "BULK":
      return overrides.bulk;
  }
}

export interface WeeklyProposalInput {
  /** The rate that was planned for the week that just ended (kg/wk, +=gain). */
  plannedRateKgPerWeek: number;
  /** The measured rate over that week (regression on weight_7d_avg). */
  actualRateKgPerWeek: number;
  currentTargetKcal: number;
  /** The check-in day's empirical TDEE (for the floor/pct bounds). */
  tdeeKcal: number;
  /** Max |target change| per week, kcal (setting, default 150). */
  adjustmentCapKcal: number;
  bounds: TargetBounds;
}

export interface WeeklyProposal {
  proposedTargetKcal: number;
  /** proposed − current, post-clamp post-round. */
  adjustmentKcal: number;
  /** True when the ±adjustmentCapKcal clamp engaged. */
  capped: boolean;
  /** Which floor/pct bound (if any) held the proposal. */
  bound: BindingBound;
  /** One human line explaining the proposal (weight-trend framing only). */
  reason: string;
}

/** "+0.25" / "-0.50" — explicit sign so plan-vs-actual comparisons read cleanly. */
function fmtRate(rateKgPerWeek: number): string {
  return `${rateKgPerWeek < 0 ? "" : "+"}${rateKgPerWeek.toFixed(2)}`;
}

/**
 * The weekly check-in engine: the gap between the actual and planned rate is an
 * energy-balance error of (actual − planned) × 7700 / 7 kcal/day, so the target
 * moves by the opposite amount — clamped to ±adjustmentCapKcal, then held inside
 * the floor/pct bounds, then rounded. Because stored targets and the cap are
 * multiples of 10, the final adjustment never exceeds the cap after rounding.
 * Works identically for cuts and bulks — it only ever sees rates.
 */
export function weeklyProposal(input: WeeklyProposalInput): WeeklyProposal {
  const errorKgPerWeek = input.actualRateKgPerWeek - input.plannedRateKgPerWeek;
  const rawAdj = (-errorKgPerWeek * KCAL_PER_KG) / 7;
  const clampedAdj = Math.min(
    input.adjustmentCapKcal,
    Math.max(-input.adjustmentCapKcal, rawAdj),
  );
  const capped = clampedAdj !== rawAdj;

  const { targetKcal, bound } = boundAndRound(
    input.currentTargetKcal + clampedAdj,
    input.tdeeKcal,
    input.bounds,
  );
  const adjustmentKcal = targetKcal - input.currentTargetKcal;

  const trendVsPlan = `Trend ${fmtRate(input.actualRateKgPerWeek)} kg/wk vs plan ${fmtRate(input.plannedRateKgPerWeek)}`;
  let reason: string;
  if (Math.abs(clampedAdj) < ROUND_KCAL / 2) {
    reason = `${trendVsPlan} — on plan, no change.`;
  } else if (adjustmentKcal === 0) {
    // The intended move was swallowed by a bound (or rounding); a bound
    // suffix below explains which.
    reason = `${trendVsPlan} — no change.`;
  } else {
    const move =
      adjustmentKcal > 0
        ? `increase by ${adjustmentKcal}`
        : `reduce by ${-adjustmentKcal}`;
    reason = `${trendVsPlan} — ${move} kcal/day${capped ? " (weekly cap)" : ""}.`;
  }
  if (bound === "floor") {
    reason += ` Held at the ${input.bounds.floorKcal} kcal floor.`;
  } else if (bound === "maxDeficitPct") {
    reason += " Held at the max-deficit bound.";
  } else if (bound === "maxSurplusPct") {
    reason += " Held at the max-surplus bound.";
  }

  return {
    proposedTargetKcal: targetKcal,
    adjustmentKcal,
    capped,
    bound,
    reason,
  };
}

/**
 * The check-in day currently due: the LATEST day ≤ `today` that is a whole
 * number of weeks after `startDate` (exclusive of the start day itself), or
 * null before the first week has elapsed. Recomputed daily by the scheduler, so
 * a missed due day catches up on the next tick; the unique (goalId, day) row is
 * the dedupe.
 */
export function dueCheckInDay(startDate: string, today: string): string | null {
  const elapsed = daysBetween(startDate, today);
  if (elapsed < 7) return null;
  return shiftDay(startDate, elapsed - (elapsed % 7));
}
