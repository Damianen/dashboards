import { civilDay, dayToDbDate, shiftDay, todayLocal } from "@/lib/dates";
import { prisma } from "@/server/db";
// Type-only: erased at build, so no extra server code is pulled in.
import type { TrendPoint } from "@/server/services/summary";

/**
 * Read side for Apple Watch workouts ingested via /api/health-import. Deliberately
 * SEPARATE from the daily_summary view + trend machinery: workouts are discrete
 * events (many per day), and their activeEnergyKcal is an expenditure ESTIMATE that
 * must never be fused into the daily_summary intake / net-calorie math (see the
 * health domain guardrails). This service only reads workout rows back out.
 */

const RECENT_LIMIT = 6;

/** listWorkouts bounds — the take is clamped here as well as at the MCP edge. */
const LIST_DEFAULT_LIMIT = 50;
const LIST_MAX_LIMIT = 200;

export interface WorkoutListItem {
  id: string;
  type: string;
  startedAt: string; // ISO instant
  day: string; // civil "YYYY-MM-DD"
  durationSeconds: number | null;
  distance: number | null;
  activeEnergyKcal: number | null;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
}

/** The workout columns every read here selects (day is the @db.Date column). */
const WORKOUT_SELECT = {
  id: true,
  type: true,
  startedAt: true,
  day: true,
  durationSeconds: true,
  distance: true,
  activeEnergyKcal: true,
  avgHeartRate: true,
  maxHeartRate: true,
} as const;

/** A selected workout row before serialization (dates still Date objects). */
export interface WorkoutRow {
  id: string;
  type: string;
  startedAt: Date;
  day: Date;
  durationSeconds: number | null;
  distance: number | null;
  activeEnergyKcal: number | null;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
}

/** PURE: one selected row → the wire item (ISO instant + civil day). The single
 *  serializer for every workout read. Unit-testable. */
export function serializeWorkout(w: WorkoutRow): WorkoutListItem {
  return {
    id: w.id,
    type: w.type,
    startedAt: w.startedAt.toISOString(),
    day: civilDay(w.day),
    durationSeconds: w.durationSeconds,
    distance: w.distance,
    activeEnergyKcal: w.activeEnergyKcal,
    avgHeartRate: w.avgHeartRate,
    maxHeartRate: w.maxHeartRate,
  };
}

export interface WorkoutTrends {
  /** Most-recent-first, capped — for the panel's session list. */
  recent: WorkoutListItem[];
  /** Total workout minutes per civil day — bucketed weekly on the client. */
  dailyMinutes: TrendPoint[];
}

/**
 * PURE: total workout minutes per civil day, rounded to whole minutes, sorted
 * ascending. Workouts with no duration are skipped; days with no workouts are
 * omitted (a gap), matching the other daily trend series. Unit-testable.
 */
export function dailyWorkoutMinutes(
  workouts: { day: string; durationSeconds: number | null }[],
): TrendPoint[] {
  const secondsByDay = new Map<string, number>();
  for (const w of workouts) {
    if (w.durationSeconds == null) continue;
    secondsByDay.set(w.day, (secondsByDay.get(w.day) ?? 0) + w.durationSeconds);
  }
  return [...secondsByDay.entries()]
    .map(([day, seconds]) => ({ day, value: Math.round(seconds / 60) }))
    .sort((a, b) => a.day.localeCompare(b.day));
}

/**
 * The most recent Apple-Watch workouts over the last `days` days (ending today),
 * newest first, capped at `limit` (default 50, max 200). Read side only — these
 * rows are wearable-synced (upserted by external id) and never mutated here; their
 * activeEnergyKcal stays a trend estimate, never fused into intake math.
 */
export async function listWorkouts(
  days: number,
  limit: number = LIST_DEFAULT_LIMIT,
): Promise<WorkoutListItem[]> {
  const end = todayLocal();
  const start = shiftDay(end, -(days - 1));
  const rows = await prisma.workout.findMany({
    where: { day: { gte: dayToDbDate(start), lte: dayToDbDate(end) } },
    orderBy: { startedAt: "desc" },
    take: Math.min(Math.max(limit, 1), LIST_MAX_LIMIT),
    select: WORKOUT_SELECT,
  });
  return rows.map(serializeWorkout);
}

/** Recent workouts + a daily-minutes series over the last `days` days (ending today). */
export async function getWorkoutTrends(days: number): Promise<WorkoutTrends> {
  const end = todayLocal();
  const start = shiftDay(end, -(days - 1));
  const rows = await prisma.workout.findMany({
    where: { day: { gte: dayToDbDate(start), lte: dayToDbDate(end) } },
    orderBy: { startedAt: "desc" },
    select: WORKOUT_SELECT,
  });

  const recent: WorkoutListItem[] = rows
    .slice(0, RECENT_LIMIT)
    .map(serializeWorkout);

  const dailyMinutes = dailyWorkoutMinutes(
    rows.map((w) => ({
      day: civilDay(w.day),
      durationSeconds: w.durationSeconds,
    })),
  );

  return { recent, dailyMinutes };
}
