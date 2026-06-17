import { DEFAULT_TIMEZONE, zonedDateString } from "@/lib/dates";

// Pure sync-window computation (apps/finance/CLAUDE.md):
// - First sync after a fresh consent backfills the maximum history (~12 months).
// - Incremental sync refetches from (last booking date − 3 days) for overlap.
// - The window is a calendar [date_from, date_to] in Europe/Amsterdam, clamped
//   so date_from never exceeds date_to (idempotent re-runs).

export const OVERLAP_DAYS = 3;
export const BACKFILL_MONTHS = 12;

export interface SyncWindowParams {
  isFirstSync: boolean;
  lastBookingDate?: Date | null;
  now?: Date;
  overlapDays?: number;
  backfillMonths?: number;
  timeZone?: string;
}

export interface SyncWindow {
  dateFrom: string; // YYYY-MM-DD
  dateTo: string; // YYYY-MM-DD
}

interface Ymd {
  y: number;
  m: number; // 1-12
  d: number;
}

function ymdOf(date: Date, timeZone: string): Ymd {
  const [y, m, d] = zonedDateString(date, timeZone).split("-").map(Number);
  return { y, m, d };
}

/** Build a YYYY-MM-DD string, normalizing month/day overflow via Date.UTC. */
function toIso(y: number, monthIndex: number, day: number): string {
  const dt = new Date(Date.UTC(y, monthIndex, day));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export function computeSyncWindow(params: SyncWindowParams): SyncWindow {
  const {
    isFirstSync,
    lastBookingDate,
    now = new Date(),
    overlapDays = OVERLAP_DAYS,
    backfillMonths = BACKFILL_MONTHS,
    timeZone = DEFAULT_TIMEZONE,
  } = params;

  const today = ymdOf(now, timeZone);
  const dateTo = toIso(today.y, today.m - 1, today.d);

  let dateFrom: string;
  if (isFirstSync || !lastBookingDate) {
    // Deep history backfill: ~backfillMonths before today.
    dateFrom = toIso(today.y, today.m - 1 - backfillMonths, today.d);
  } else {
    // Incremental: overlap a few days behind the last booking date.
    const last = ymdOf(lastBookingDate, timeZone);
    dateFrom = toIso(last.y, last.m - 1, last.d - overlapDays);
  }

  // ISO date strings sort lexicographically; never fetch a backwards window.
  if (dateFrom > dateTo) dateFrom = dateTo;

  return { dateFrom, dateTo };
}
