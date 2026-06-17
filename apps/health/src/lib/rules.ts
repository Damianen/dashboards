// Pure, deterministic domain rules — vitest-covered (CLAUDE.md "Definition of done").
// computeWaterTarget restates the daily_summary view's formula in TS for testing only;
// the SQL view remains the single runtime source of truth for the water target.

import { DomainError } from "@/server/services/errors";

/** Water target in mL: base intake plus a per-mg bump for the day's stimulants. */
export function computeWaterTarget(
  baseMl: number,
  mlPerMg: number,
  stimulantMg: number,
): number {
  return Math.round(baseMl + stimulantMg * mlPerMg);
}

const THREE_HOURS_MS = 3 * 60 * 60 * 1000;

/** True if a lifting session started within the last 3 hours and should be reused. */
export function shouldReuseSession(
  lastStartedAt: Date | null,
  now: Date,
): boolean {
  if (!lastStartedAt) return false;
  return now.getTime() - lastStartedAt.getTime() <= THREE_HOURS_MS;
}

/**
 * A macro nutrient set, per 100 g or scaled to a portion. `null` means the source
 * (Open Food Facts, or a manual entry) didn't report that nutrient — never 0.
 */
export interface Macros {
  kcal: number | null;
  proteinG: number | null;
  carbG: number | null;
  fatG: number | null;
  fiberG: number | null;
  sugarG: number | null;
  saltG: number | null;
}

/**
 * Scale per-100 g macros to `quantityG`: each non-null field × quantityG / 100,
 * rounded to 1 decimal. Nulls stay null (an unknown nutrient is never fabricated
 * to 0). Pure — `logFood` decides separately how to persist any remaining nulls.
 */
export function scaleMacros(per100g: Macros, quantityG: number): Macros {
  const scale = (v: number | null): number | null =>
    v == null ? null : Math.round(((v * quantityG) / 100) * 10) / 10;
  return {
    kcal: scale(per100g.kcal),
    proteinG: scale(per100g.proteinG),
    carbG: scale(per100g.carbG),
    fatG: scale(per100g.fatG),
    fiberG: scale(per100g.fiberG),
    sugarG: scale(per100g.sugarG),
    saltG: scale(per100g.saltG),
  };
}

// ----- Workout template targets & progress -----

/** The shape a target carries, regardless of where it's stored (template, plan
 *  snapshot, or a freshly-parsed input). Kept structural so this module stays
 *  free of Prisma and Zod. */
export interface TemplateTargetLike {
  targetType: "REPS" | "VOLUME";
  targetSets?: number | null;
  repMin?: number | null;
  repMax?: number | null;
  targetVolumeKg?: number | null;
}

/**
 * Defensive assertion that a target's fields match its mode: REPS needs a set
 * count and repMin ≤ repMax; VOLUME needs a volume goal. The Zod schema already
 * guarantees this for parsed input — this guards anything built by hand and keeps
 * the rule independently tested. Throws DomainError on violation.
 */
export function validateTemplateTarget(item: TemplateTargetLike): void {
  if (item.targetType === "REPS") {
    if (item.targetSets == null) {
      throw new DomainError("REPS target requires targetSets");
    }
    if (item.repMin == null || item.repMax == null) {
      throw new DomainError("REPS target requires repMin and repMax");
    }
    if (item.repMin > item.repMax) {
      throw new DomainError("repMin must be ≤ repMax");
    }
    return;
  }
  if (item.targetVolumeKg == null) {
    throw new DomainError("VOLUME target requires targetVolumeKg");
  }
}

/** Whether a logged rep count satisfies the target's rep range. No range given
 *  (both bounds null) → always true; otherwise repMin ≤ reps ≤ repMax, with an
 *  open-ended bound treated as ±Infinity. */
export function setMeetsRepRange(
  reps: number,
  repMin?: number | null,
  repMax?: number | null,
): boolean {
  if (repMin == null && repMax == null) return true;
  return reps >= (repMin ?? -Infinity) && reps <= (repMax ?? Infinity);
}

/** A plan item reduced to what progress math needs. */
export interface PlanTarget {
  exerciseId: string;
  targetType: "REPS" | "VOLUME";
  targetSets: number | null;
  repMin: number | null;
  repMax: number | null;
  targetVolumeKg: number | null;
}

/** One actually-logged set reduced to what progress math needs. */
export interface ActualSet {
  exerciseId: string;
  reps: number;
  weightKg: number;
  isWarmup: boolean;
}

/** Per-plan-item progress against the sets actually logged. */
export interface PlanProgress {
  exerciseId: string;
  targetSets: number | null;
  setsDone: number;
  inRangeSets: number;
  targetVolumeKg: number | null;
  actualVolumeKg: number;
  complete: boolean;
}

/**
 * Reduce a session's plan + its logged sets to per-item progress. Only NON-warmup
 * sets count (CLAUDE.md guardrail: warmups never count toward volume), so a set
 * count and volume both reflect working sets. REPS items complete when enough sets
 * are done; VOLUME items complete when the worked volume reaches the goal.
 */
export function summarizePlanProgress(
  plan: PlanTarget[],
  actualSets: ActualSet[],
): PlanProgress[] {
  return plan.map((item) => {
    const working = actualSets.filter(
      (s) => s.exerciseId === item.exerciseId && !s.isWarmup,
    );
    const setsDone = working.length;
    const inRangeSets = working.filter((s) =>
      setMeetsRepRange(s.reps, item.repMin, item.repMax),
    ).length;
    const actualVolumeKg = working.reduce(
      (sum, s) => sum + s.reps * s.weightKg,
      0,
    );
    const complete =
      item.targetType === "REPS"
        ? setsDone >= (item.targetSets ?? 0)
        : item.targetVolumeKg != null && actualVolumeKg >= item.targetVolumeKg;
    return {
      exerciseId: item.exerciseId,
      targetSets: item.targetSets,
      setsDone,
      inRangeSets,
      targetVolumeKg: item.targetVolumeKg,
      actualVolumeKg,
      complete,
    };
  });
}
