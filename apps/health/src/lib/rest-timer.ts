/**
 * Pure countdown math for the between-sets rest timer. Everything derives from
 * wall-clock timestamps (endsAt − now) rather than counted ticks, so a
 * backgrounded tab or locked phone never drifts the countdown — the next tick
 * lands exactly where wall time says it should.
 */

/** The wall-clock instant (ms epoch) the rest ends: log time + planned rest. */
export function restEndsAt(loggedAtMs: number, restSec: number): number {
  return loggedAtMs + restSec * 1000;
}

/** Whole seconds left until endsAt, rounded UP (a display of "0:01" still has
 *  up to a full second to run) and clamped at 0 once the deadline passes. */
export function remainingSec(endsAtMs: number, nowMs: number): number {
  return Math.max(0, Math.ceil((endsAtMs - nowMs) / 1000));
}

/** m:ss label (90 → "1:30", 0 → "0:00"). Rest is capped at 3600 s upstream, so
 *  minutes can reach 60 but hours never render. */
export function formatRest(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Fraction of the rest still remaining, clamped to 0..1 — drives the progress
 *  track. A non-positive total (never planned upstream) reads as fully elapsed. */
export function restFraction(totalSec: number, remaining: number): number {
  if (totalSec <= 0) return 0;
  return Math.min(1, Math.max(0, remaining / totalSec));
}
