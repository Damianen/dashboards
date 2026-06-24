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

/**
 * "Last performed" label for a civil day relative to `today` (both "YYYY-MM-DD"):
 * null → "Never", same/future day → "Today", one day → "Yesterday", up to 6 days
 * → "N days ago", otherwise an absolute "24 Feb 2026". Pure: both strings are
 * parsed as UTC midnight (civil days carry no time/zone) and the display is forced
 * to UTC so the printed date can't drift across a zone boundary.
 */
export function formatLastPerformed(day: string | null, today: string): string {
  if (!day) return "Never";
  const dayMs = Date.parse(`${day}T00:00:00Z`);
  const todayMs = Date.parse(`${today}T00:00:00Z`);
  const diffDays = Math.round((todayMs - dayMs) / 86_400_000);
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays <= 6) return `${diffDays} days ago`;
  return new Date(dayMs).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Coarse "time ago" label ("just now" / "5 min ago" / "3 h ago" / "2 d ago") relative to
 * `now` (defaults to the current time). Dates arrive over JSON as strings; both are
 * accepted. A future instant clamps to "just now". Pure when `now` is supplied.
 */
export function relativeTimeFromNow(
  date: Date | string,
  now: Date = new Date(),
): string {
  const diffMs = now.getTime() - new Date(date).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
}
