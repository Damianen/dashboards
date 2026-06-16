// Pure, deterministic domain rules — vitest-covered (CLAUDE.md "Definition of done").
// computeWaterTarget restates the daily_summary view's formula in TS for testing only;
// the SQL view remains the single runtime source of truth for the water target.

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
