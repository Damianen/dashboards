// Pure display formatters for the dashboard. Kept side-effect free so they can
// be unit-tested without a DOM or DB.

/** Minutes → "h:mm" (e.g. 437 → "7:17"). Negative input clamps to 0. */
export function formatHm(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h}:${m.toString().padStart(2, "0")}`;
}

/** Round to `digits` decimals, dropping trailing zeros ("72.0" → "72"). */
export function formatNumber(value: number, digits = 0): string {
  return Number(value.toFixed(digits)).toLocaleString("en-US");
}

/** Kilograms with one decimal (e.g. 81.25 → "81.3 kg"). */
export function formatKg(value: number): string {
  return `${formatNumber(value, 1)} kg`;
}

/**
 * Progress percentage of value toward target, clamped to 0–100. A non-positive
 * target yields 0 (no meaningful progress bar without a goal).
 */
export function clampPercent(value: number, target: number): number {
  if (target <= 0) return 0;
  return Math.max(0, Math.min(100, (value / target) * 100));
}
