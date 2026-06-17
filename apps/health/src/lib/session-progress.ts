// Pure, client-safe view helpers for the session screen. Structural inputs keep
// this free of Prisma/Zod so it's unit-testable without a DB (CLAUDE.md
// "Definition of done"). The in-range rule reuses the same setMeetsRepRange the
// service uses for progress, so the per-set marker and the counts never disagree.

import { setMeetsRepRange } from "./rules";

/** The minimum a session exercise needs to count plan progress. */
export interface PlanProgressLike {
  plan: unknown | null;
  progress: { complete: boolean } | null;
}

/** How many of a session's exercises are planned, and how many of those are
 *  complete. Unplanned ("Extra") exercises count toward neither. */
export function countPlanProgress(exercises: PlanProgressLike[]): {
  planned: number;
  completed: number;
} {
  let planned = 0;
  let completed = 0;
  for (const e of exercises) {
    if (e.plan == null) continue;
    planned += 1;
    if (e.progress?.complete) completed += 1;
  }
  return { planned, completed };
}

/** A plan target reduced to what set classification needs. */
export interface SetClassPlan {
  targetType: "REPS" | "VOLUME";
  repMin: number | null;
  repMax: number | null;
}

export type SetClass = "warmup" | "in-range" | "out-of-range" | "neutral";

/**
 * Classify a logged set for display against its plan. Warmups are always
 * "warmup" (muted, excluded from progress — the domain guardrail). A working set
 * is judged in/out of range only against a REPS plan that carries a range;
 * VOLUME plans, unplanned exercises, and open-ended ranges leave it "neutral".
 */
export function classifyWorkingSet(
  set: { isWarmup: boolean; reps: number },
  plan: SetClassPlan | null,
): SetClass {
  if (set.isWarmup) return "warmup";
  if (plan == null || plan.targetType !== "REPS") return "neutral";
  if (plan.repMin == null && plan.repMax == null) return "neutral";
  return setMeetsRepRange(set.reps, plan.repMin, plan.repMax)
    ? "in-range"
    : "out-of-range";
}
