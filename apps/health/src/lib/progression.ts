// Progressive-overload suggestion engine. Pure: no I/O, no Prisma, no Zod — it
// reads one prior set + the plan's rep range/increment and proposes the next
// set's reps/weight. The suggestion is only ever an editable default; logging
// always uses whatever the user actually enters.

/** The same exercise + set position from the most recent prior session. */
export interface LastSet {
  reps: number;
  weightKg: number;
}

/** The plan snapshot this set is measured against (Decimals already coerced). */
export interface ProgressionPlan {
  repMin: number;
  repMax: number;
  incrementKg: number;
  /** The template's start weight, used only when there's no history. */
  startWeightKg?: number | null;
}

export interface SuggestedSet {
  reps: number;
  /** null when there's no history and the template carries no start weight. */
  weightKg: number | null;
  /** true only on the forced progressive-overload bump (top of range → +increment). */
  weightIncreased: boolean;
}

/** Round to the nearest 0.5 kg — every returned weight passes through here. */
function round05(x: number): number {
  return Math.round(x * 2) / 2;
}

/**
 * Suggest the next set's reps and weight from the same set last time:
 * - no history          → start of the range at the template's start weight (or blank);
 * - below the top        → one more rep at the same weight (one rep per session);
 * - at/over the top      → reset to the bottom of the range and bump the weight by the
 *                          increment (the forced progressive overload).
 */
export function suggestNextSet(
  last: LastSet | null,
  plan: ProgressionPlan,
): SuggestedSet {
  if (last == null) {
    return {
      reps: plan.repMin,
      weightKg: plan.startWeightKg == null ? null : round05(plan.startWeightKg),
      weightIncreased: false,
    };
  }
  if (last.reps < plan.repMax) {
    return {
      reps: last.reps + 1,
      weightKg: round05(last.weightKg),
      weightIncreased: false,
    };
  }
  // last.reps >= repMax: hit the top of the range, so bump the weight and reset reps.
  return {
    reps: plan.repMin,
    weightKg: round05(last.weightKg + plan.incrementKg),
    weightIncreased: true,
  };
}
