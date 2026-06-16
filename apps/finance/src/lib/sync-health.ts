// Pure sync-health evaluation. No DB, no I/O — table-driven tested
// (sync-health.test.ts). Decides when a bank connection needs a re-consent
// reminder and builds a NotificationLog dedupe key that re-arms after the
// connection recovers (new successful sync) or is re-consented (new validUntil).

import { DEFAULT_TIMEZONE, zonedDateString, zonedDayStart } from "@/lib/dates";

const DAY_MS = 86_400_000;

export const EXPIRY_WARN_DAYS = 7;
export const FAILURE_LIMIT = 3;

export interface SyncHealthInput {
  id: string;
  validUntil: Date | null;
  lastSyncedAt: Date | null; // last SUCCESSFUL sync (set only on success)
  consecutiveFailures: number;
  status: string; // ConnectionStatus — carried for the caller, not the logic
}

export type SyncHealthReason =
  | "expiring"
  | "failing"
  | "expiring+failing"
  | null;

export interface SyncHealth {
  daysOfValidity: number | null; // Amsterdam calendar days until validUntil
  expiringSoon: boolean;
  failing: boolean;
  shouldAlert: boolean;
  reason: SyncHealthReason;
  dedupeKey: string | null; // null when !shouldAlert
}

/** Amsterdam calendar-day difference between two instants' local days. */
function calendarDaysBetween(from: Date, to: Date, tz: string): number {
  const a = zonedDayStart(from, tz).getTime();
  const b = zonedDayStart(to, tz).getTime();
  // Local midnights differ by 23/24/25h across DST; round to the day count.
  return Math.round((b - a) / DAY_MS);
}

/**
 * Evaluate one connection's sync health at `now`.
 * - expiringSoon: a consent whose validUntil is <= 7 calendar days away (or past).
 * - failing: 3+ consecutive failed sync runs.
 * Dedupe key:
 * - expiring (and expiring+failing) → `consent-expiry:<id>:<validUntilDate>`
 *   — re-consent issues a new validUntil → new key, so it re-arms.
 * - failing only → `sync-fail:<id>:<lastSuccessDate|never>` — a successful sync
 *   advances lastSyncedAt → new key, so the next failure streak re-arms.
 * Both conditions emit ONE key (the expiry one — re-consent fixes both).
 */
export function evaluateSyncHealth(
  conn: SyncHealthInput,
  now: Date,
  tz: string = DEFAULT_TIMEZONE,
): SyncHealth {
  const daysOfValidity =
    conn.validUntil === null ? null : calendarDaysBetween(now, conn.validUntil, tz);
  const expiringSoon =
    daysOfValidity !== null && daysOfValidity <= EXPIRY_WARN_DAYS;
  const failing = conn.consecutiveFailures >= FAILURE_LIMIT;
  const shouldAlert = expiringSoon || failing;

  const reason: SyncHealthReason = !shouldAlert
    ? null
    : expiringSoon && failing
      ? "expiring+failing"
      : expiringSoon
        ? "expiring"
        : "failing";

  let dedupeKey: string | null = null;
  if (expiringSoon && conn.validUntil) {
    dedupeKey = `consent-expiry:${conn.id}:${zonedDateString(conn.validUntil, tz)}`;
  } else if (failing) {
    const anchor = conn.lastSyncedAt
      ? zonedDateString(conn.lastSyncedAt, tz)
      : "never";
    dedupeKey = `sync-fail:${conn.id}:${anchor}`;
  }

  return { daysOfValidity, expiringSoon, failing, shouldAlert, reason, dedupeKey };
}
