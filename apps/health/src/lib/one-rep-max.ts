// Estimated one-rep max (e1RM): the heaviest single a set predicts, used to track
// strength progression across different rep ranges on ONE comparable scale. Epley's
// formula — 1RM ≈ w × (1 + reps/30) — collapses to the lifted weight at a true single
// (reps = 1). Pure and side-effect-free (CLAUDE.md "Definition of done"): the service
// coerces Prisma.Decimal → number before calling in, so everything here is plain math.

/** One set's load for e1RM purposes (already numeric, warmups flagged). */
export interface E1rmSet {
  reps: number;
  weightKg: number;
  isWarmup: boolean;
}

/** The top working set of a session and the e1RM it predicts. */
export interface BestSet {
  e1rmKg: number;
  reps: number;
  weightKg: number;
}

/**
 * Epley estimated 1RM for a single set, in kg. Returns the weight unchanged at
 * reps = 1 (a true single is its own 1RM) and 0 for a non-positive rep count or
 * weight (nothing to estimate). The estimate drifts upward past ~12 reps, so callers
 * surface it as a trend signal, never a tested max.
 */
export function epleyE1rm(weightKg: number, reps: number): number {
  if (reps <= 0 || weightKg <= 0) return 0;
  // Raw Epley overshoots a true single by ~3% (×31/30); anchor reps = 1 to the
  // lifted weight so a logged single reads as exactly its own 1RM.
  if (reps === 1) return weightKg;
  return weightKg * (1 + reps / 30);
}

/**
 * The best (max) e1RM across an exercise's WORKING sets — warmups never count, the
 * same guardrail volume uses. Returns the predicting set and its e1RM, or null when
 * the exercise had no scoreable working set. On a tie the earliest set wins.
 */
export function bestE1rm(sets: E1rmSet[]): BestSet | null {
  let best: BestSet | null = null;
  for (const s of sets) {
    if (s.isWarmup) continue;
    const e1rmKg = epleyE1rm(s.weightKg, s.reps);
    if (e1rmKg <= 0) continue;
    if (best === null || e1rmKg > best.e1rmKg) {
      best = { e1rmKg, reps: s.reps, weightKg: s.weightKg };
    }
  }
  return best;
}
