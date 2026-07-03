import { civilDay, shiftDay, todayLocal } from "@/lib/dates";
import {
  lateCaffeineVsSleep,
  readinessVsLiftingVolume,
  sleepVsNextDayReadiness,
  weightTrendVsSleep,
  type DayFlag,
  type DayValue,
  type Observation,
  OBSERVATION_TITLES,
} from "@/lib/observations";
import { prisma } from "@/server/db";

// The hour (0–23, Europe/Amsterdam) at/after which logged caffeine counts as "late" for
// the late-caffeine-vs-sleep detector. A DB-backed setting like water.baseTargetMl
// (read with a default, configurable via the settings row); defaults to 14:00.
const LATE_CAFFEINE_HOUR_KEY = "observations.lateCaffeineHour";
const DEFAULT_LATE_CAFFEINE_HOUR = 14;

async function getLateCaffeineHour(): Promise<number> {
  const setting = await prisma.setting.findUnique({
    where: { key: LATE_CAFFEINE_HOUR_KEY },
  });
  if (!setting) return DEFAULT_LATE_CAFFEINE_HOUR;
  const hour = Number(setting.value);
  return Number.isInteger(hour) && hour >= 0 && hour <= 23
    ? hour
    : DEFAULT_LATE_CAFFEINE_HOUR;
}

// Only the daily_summary columns the detectors read. Deliberately omits any wearable
// active-calorie/net field — observations never touch energy balance (CLAUDE.md).
interface RawSummaryRow {
  day: unknown;
  sleepScore: unknown;
  readinessScore: unknown;
  liftingVolumeKg: unknown;
  weight7dAvg: unknown;
}

function num(v: unknown): number | null {
  return v == null ? null : Number(v);
}

/** Keep only the days where a metric actually has a value. */
function toSeries(rows: { day: string; value: number | null }[]): DayValue[] {
  const out: DayValue[] = [];
  for (const r of rows) if (r.value != null) out.push({ day: r.day, value: r.value });
  return out;
}

/**
 * The set of civil days in [start, end] on which any caffeine source was logged at/after
 * `hour` (local time). A day with no caffeine — or caffeine only earlier — is absent here
 * and reported as a non-late day. Mirrors the unified-caffeine model: every stimulant
 * entry plus any caffeine-bearing food entry or checked supplement counts.
 */
async function getLateCaffeineFlags(
  start: string,
  end: string,
  hour: number,
): Promise<DayFlag[]> {
  const rows = await prisma.$queryRaw<{ day: unknown }[]>`
    SELECT DISTINCT day::text AS "day"
    FROM (
      SELECT day, EXTRACT(HOUR FROM logged_at AT TIME ZONE 'Europe/Amsterdam') AS h
        FROM stimulant_entries
        WHERE day BETWEEN ${start}::date AND ${end}::date
      UNION ALL
      SELECT day, EXTRACT(HOUR FROM eaten_at AT TIME ZONE 'Europe/Amsterdam') AS h
        FROM food_entries
        WHERE day BETWEEN ${start}::date AND ${end}::date
          AND caffeine_mg IS NOT NULL AND caffeine_mg > 0
      UNION ALL
      SELECT day, EXTRACT(HOUR FROM taken_at AT TIME ZONE 'Europe/Amsterdam') AS h
        FROM supplement_logs
        WHERE day BETWEEN ${start}::date AND ${end}::date
          AND caffeine_snapshot IS NOT NULL AND caffeine_snapshot > 0
    ) src
    WHERE h >= ${hour}
  `;
  const lateDays = new Set(rows.map((r) => String(r.day)));

  // One flag per calendar day in the window so a quiet day is a real "not late", not a gap.
  const flags: DayFlag[] = [];
  for (let d = start; d <= end; d = shiftDay(d, 1)) {
    flags.push({ day: d, flag: lateDays.has(d) });
  }
  return flags;
}

export interface ObservationsResult {
  windowDays: number;
  observations: Observation[];
}

/**
 * Run every detector over the recent window and return the survivors ranked by |strength|
 * (strongest first). Each observation is a correlational HYPOTHESIS with its n stated —
 * never causal, never a target input (CLAUDE.md). Detectors below the minimum paired-day
 * count return null and simply don't appear.
 */
export async function getObservations(window = 30): Promise<ObservationsResult> {
  const windowDays = window;
  const end = todayLocal();
  const start = shiftDay(end, -(windowDays - 1));
  // Lagged detectors pair a predictor on day D with an outcome on D+1, so fetch the daily
  // series one day past `end` to resolve the window's last pair.
  const seriesEnd = shiftDay(end, 1);

  const summaryRows = await prisma.$queryRaw<RawSummaryRow[]>`
    SELECT
      day::text         AS "day",
      sleep_score       AS "sleepScore",
      readiness_score   AS "readinessScore",
      lifting_volume_kg AS "liftingVolumeKg",
      weight_7d_avg     AS "weight7dAvg"
    FROM daily_summary
    WHERE day BETWEEN ${start}::date AND ${seriesEnd}::date
    ORDER BY day
  `;

  const sleepScore = toSeries(
    summaryRows.map((r) => ({ day: String(r.day), value: num(r.sleepScore) })),
  );
  const readiness = toSeries(
    summaryRows.map((r) => ({ day: String(r.day), value: num(r.readinessScore) })),
  );
  const liftingVolume = toSeries(
    summaryRows.map((r) => ({ day: String(r.day), value: num(r.liftingVolumeKg) })),
  );
  const weight7dAvg = toSeries(
    summaryRows.map((r) => ({ day: String(r.day), value: num(r.weight7dAvg) })),
  );

  const lateHour = await getLateCaffeineHour();
  const lateFlags = await getLateCaffeineFlags(start, end, lateHour);

  const observations = [
    lateCaffeineVsSleep(lateFlags, sleepScore, windowDays, lateHour),
    sleepVsNextDayReadiness(sleepScore, readiness, windowDays),
    readinessVsLiftingVolume(readiness, liftingVolume, windowDays),
    weightTrendVsSleep(weight7dAvg, sleepScore, windowDays),
  ]
    .filter((o): o is Observation => o !== null)
    .sort((a, b) => Math.abs(b.strength) - Math.abs(a.strength));

  return { windowDays, observations };
}

// A surfaced observation must clear both bars: a moderate correlation (|r| ≥ 0.4) over a
// real sample (n ≥ 12). Below this it's noise we don't interrupt the day for.
const NOTEWORTHY_STRENGTH = 0.4;
const NOTEWORTHY_MIN_N = 12;

/**
 * The strongest noteworthy observation that has never been pushed, or null.
 * Read-only over the digest's append-only dedupe table — recording stays with
 * the notification digest (notifications.ts); surfacing one here (briefing)
 * never uses it up.
 */
export async function getFreshObservation(): Promise<Observation | null> {
  const { observations } = await getObservations();
  const noteworthy = observations.filter(
    (o) => Math.abs(o.strength) >= NOTEWORTHY_STRENGTH && o.n >= NOTEWORTHY_MIN_N,
  );
  if (noteworthy.length === 0) return null;

  // Drop any observation already pushed, then take the strongest remaining
  // (observations arrive ranked by |strength|).
  const seen = await prisma.notifiedObservation.findMany({
    where: { observationId: { in: noteworthy.map((o) => o.id) } },
    select: { observationId: true },
  });
  const seenIds = new Set(seen.map((s) => s.observationId));
  return noteworthy.find((o) => !seenIds.has(o.id)) ?? null;
}

/** One past observation push, labeled for display without re-running detectors. */
export interface NotifiedObservationView {
  observationId: string;
  /** From OBSERVATION_TITLES; falls back to the raw id for detectors since removed. */
  title: string;
  day: string;
  notifiedAt: string;
}

/**
 * The most recent notified observations, newest first — a read-only view over
 * the digest's append-only dedupe table (notifications.ts writes it; nothing
 * here mutates it).
 */
export async function listNotifiedObservations(
  limit = 20,
): Promise<NotifiedObservationView[]> {
  const rows = await prisma.notifiedObservation.findMany({
    orderBy: { notifiedAt: "desc" },
    take: limit,
  });
  const titles: Record<string, string> = OBSERVATION_TITLES;
  return rows.map((r) => ({
    observationId: r.observationId,
    title: titles[r.observationId] ?? r.observationId,
    day: civilDay(r.day),
    notifiedAt: r.notifiedAt.toISOString(),
  }));
}
