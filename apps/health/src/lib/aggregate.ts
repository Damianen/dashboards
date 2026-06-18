// Pure, side-effect-free aggregation helpers for the trends charts. Kept free of
// `Date` on purpose: every input is a civil "YYYY-MM-DD" day (already bucketed in
// Europe/Amsterdam by the server, see lib/dates.ts), so week math is done with
// integer day-number arithmetic only — no parsing through a timezone, no DST
// trap. Unit-testable without a DOM or DB.

import type { TrendPoint } from "@/server/services/summary";

export type { TrendPoint };

// ── Proleptic-Gregorian day-number conversions (Howard Hinnant's algorithm) ──
// Days are counted from 1970-01-01 = 0. Pure integer math, valid for any date.

function daysFromCivil(y: number, m: number, d: number): number {
  const yy = m <= 2 ? y - 1 : y;
  const era = Math.floor((yy >= 0 ? yy : yy - 399) / 400);
  const yoe = yy - era * 400;
  const doy = Math.floor((153 * (m > 2 ? m - 3 : m + 9) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

function civilFromDays(z: number): string {
  const zz = z + 719468;
  const era = Math.floor((zz >= 0 ? zz : zz - 146096) / 146097);
  const doe = zz - era * 146097;
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365,
  );
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  const year = m <= 2 ? y + 1 : y;
  return `${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * The Monday (YYYY-MM-DD) of the ISO week — weeks start Monday — that contains
 * the given civil day. Pure string→string arithmetic; no `Date`, no timezone.
 */
export function mondayOf(day: string): string {
  // Slice rather than split+index so noUncheckedIndexedAccess can't widen these
  // to `number | undefined` — inputs are always "YYYY-MM-DD".
  const y = Number(day.slice(0, 4));
  const m = Number(day.slice(5, 7));
  const d = Number(day.slice(8, 10));
  const dayNum = daysFromCivil(y, m, d);
  // 1970-01-01 (dayNum 0) is a Thursday → 0=Sunday..6=Saturday.
  const weekday = (((dayNum % 7) + 4) % 7 + 7) % 7;
  const sinceMonday = (weekday + 6) % 7; // Mon→0, Sun→6
  return civilFromDays(dayNum - sinceMonday);
}

/**
 * Bucket daily points into ISO weeks (Monday-start), reduced by `sum` or `avg`.
 * `avg` is the mean of the values actually present in the week (gaps don't
 * dilute it). Returns one entry per week with `weekStart` = the Monday's civil
 * date, sorted ascending. Empty input → empty output.
 */
export function bucketWeekly(
  points: TrendPoint[],
  mode: "sum" | "avg",
): { weekStart: string; value: number }[] {
  const buckets = new Map<string, number[]>();
  for (const { day, value } of points) {
    const week = mondayOf(day);
    const list = buckets.get(week);
    if (list) list.push(value);
    else buckets.set(week, [value]);
  }
  return [...buckets.entries()]
    .map(([weekStart, values]) => {
      const total = values.reduce((a, b) => a + b, 0);
      return { weekStart, value: mode === "sum" ? total : total / values.length };
    })
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}

export type MergedRow = { day: string; [metric: string]: number | string };

/**
 * Align several single-metric series onto one row per day, keyed by metric name
 * — the dataset shape recharts wants for an overlaid chart. Days are the union
 * of all series (a series missing a day simply omits its key for that row, which
 * recharts renders as a gap). Rows are sorted ascending by day.
 */
export function mergeByDay(series: Record<string, TrendPoint[]>): MergedRow[] {
  const byDay = new Map<string, MergedRow>();
  for (const [metric, points] of Object.entries(series)) {
    for (const { day, value } of points) {
      const row = byDay.get(day) ?? { day };
      row[metric] = value;
      byDay.set(day, row);
    }
  }
  return [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
}
