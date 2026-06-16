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
