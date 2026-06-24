import { dayOf, dayToDbDate, todayLocal } from "@/lib/dates";
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

// `day` is stored UTC-midnight (it IS the civil date), so slicing the ISO date
// part is the exact inverse of dayToDbDate() — no timezone shift.
function civilDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Recent workouts + a daily-minutes series over the last `days` days (ending today). */
export async function getWorkoutTrends(days: number): Promise<WorkoutTrends> {
  const end = todayLocal();
  const start = dayOf(
    new Date(dayToDbDate(end).getTime() - (days - 1) * 86_400_000),
  );
  const rows = await prisma.workout.findMany({
    where: { day: { gte: dayToDbDate(start), lte: dayToDbDate(end) } },
    orderBy: { startedAt: "desc" },
    select: {
      id: true,
      type: true,
      startedAt: true,
      day: true,
      durationSeconds: true,
      distance: true,
      activeEnergyKcal: true,
      avgHeartRate: true,
      maxHeartRate: true,
    },
  });

  const recent: WorkoutListItem[] = rows.slice(0, RECENT_LIMIT).map((w) => ({
    id: w.id,
    type: w.type,
    startedAt: w.startedAt.toISOString(),
    day: civilDay(w.day),
    durationSeconds: w.durationSeconds,
    distance: w.distance,
    activeEnergyKcal: w.activeEnergyKcal,
    avgHeartRate: w.avgHeartRate,
    maxHeartRate: w.maxHeartRate,
  }));

  const dailyMinutes = dailyWorkoutMinutes(
    rows.map((w) => ({
      day: civilDay(w.day),
      durationSeconds: w.durationSeconds,
    })),
  );

  return { recent, dailyMinutes };
}
