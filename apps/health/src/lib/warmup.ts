// Pure warmup-set helpers. No I/O, no Prisma, no Zod — the service coerces
// Prisma.Decimal → number before calling in, so everything here is plain numbers
// and unit-testable without a database (CLAUDE.md "Definition of done"). Warmups
// never count toward volume or progression; these only seed the logger's prefills.

/** A template/snapshot warmup definition reduced to plain numbers (Decimals already
 *  coerced). Exactly one of weightKg (ABSOLUTE) / percentOfWorking (PERCENT) is set. */
export interface WarmupDef {
  reps: number;
  weightMode: "ABSOLUTE" | "PERCENT";
  weightKg: number | null;
  percentOfWorking: number | null;
}

/** The same exercise + warmup position from the most recent prior session. */
export interface LastWarmup {
  reps: number;
  weightKg: number;
}

/** Round to the nearest 0.5 kg — same idiom as progression.ts's round05. */
function round05(x: number): number {
  return Math.round(x * 2) / 2;
}

/**
 * Resolve a warmup definition to an absolute kg weight:
 *  - ABSOLUTE → its weightKg verbatim;
 *  - PERCENT  → workingWeightKg × percent / 100, rounded to the nearest 0.5 kg;
 *               null when there's no working weight to take a percentage of (so the
 *               logger shows a blank, editable field rather than 0).
 */
export function resolveWarmupWeight(
  def: WarmupDef,
  workingWeightKg: number | null,
): number | null {
  if (def.weightMode === "ABSOLUTE") return def.weightKg;
  if (workingWeightKg == null || def.percentOfWorking == null) return null;
  return round05((workingWeightKg * def.percentOfWorking) / 100);
}

/**
 * Suggest a warmup set's reps and weight — an editable prefill, never persisted.
 * Reuse last session's warmup at this position when there is one (mirroring how the
 * working-set suggestion reuses the prior working set); otherwise fall back to the
 * template definition, resolving any % against the working weight.
 */
export function suggestWarmupSet(
  lastWarmup: LastWarmup | null,
  def: WarmupDef,
  workingWeightKg: number | null,
): { reps: number; weightKg: number | null } {
  if (lastWarmup != null) {
    return { reps: lastWarmup.reps, weightKg: round05(lastWarmup.weightKg) };
  }
  return { reps: def.reps, weightKg: resolveWarmupWeight(def, workingWeightKg) };
}

/** A one-line recap of a warmup definition for the template preview, e.g.
 *  "8 × 50%" (PERCENT) or "8 × 40 kg" (ABSOLUTE). */
export function formatWarmupDef(def: WarmupDef): string {
  if (def.weightMode === "PERCENT") {
    return `${def.reps} × ${def.percentOfWorking ?? 0}%`;
  }
  return `${def.reps} × ${def.weightKg ?? 0} kg`;
}
