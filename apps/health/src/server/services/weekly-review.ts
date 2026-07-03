import { proteinTarget } from "@/lib/adherence";
import { mondayOf } from "@/lib/aggregate";
import { daysBetween, shiftDay, todayLocal } from "@/lib/dates";
import {
  type Callout,
  compareWeeks,
  pickExtreme,
  summarizeWeek,
  type WeekAggregates,
  type WeeklyDeltas,
} from "@/lib/weekly-review";
import { prisma } from "@/server/db";
import {
  foodLoggedDays,
  supplementCompleteDays,
} from "@/server/services/adherence";
import {
  getIntakeKcalTarget,
  getProteinGPerKg,
} from "@/server/services/settings";
import { getSummaryRange } from "@/server/services/summary";

/** The weekly review: the requested (Monday-start) week vs the one before it. */
export interface WeeklyReviewResult {
  /** Monday of the reviewed week (civil day, Europe/Amsterdam). */
  weekStart: string;
  /** Sunday of the reviewed week. */
  weekEnd: string;
  /** True when the reviewed week is still in progress (partial data). */
  isCurrentWeek: boolean;
  current: WeekAggregates;
  previous: WeekAggregates;
  /** current − previous per metric; null when either side lacks the metric. */
  deltas: WeeklyDeltas;
  /** Single-day highlights within the reviewed week (null = no data for it). */
  callouts: {
    bestSleepDay: Callout | null;
    biggestVolumeDay: Callout | null;
    worstReadinessDay: Callout | null;
  };
}

/**
 * This-week-vs-last-week review. Any `weekStart` day (default today) is
 * normalized to its week's Monday via mondayOf — weeks are Monday-start civil
 * weeks in Europe/Amsterdam. The current week is compared as a PARTIAL week:
 * day-count adherence uses only the days elapsed so far. Weight compares the
 * LAST available 7-day average in each week (weekly-push semantics). Intake and
 * expenditure are independent metrics and are never netted (CLAUDE.md).
 */
export async function getWeeklyReview(
  weekStart?: string,
): Promise<WeeklyReviewResult> {
  const today = todayLocal();
  const monday = mondayOf(weekStart ?? today);
  const weekEnd = shiftDay(monday, 6);
  const prevMonday = shiftDay(monday, -7);
  const prevEnd = shiftDay(monday, -1);

  const isCurrentWeek = monday === mondayOf(today);
  // 7 for past (complete) weeks; for the in-progress week, Monday..today
  // inclusive — adherence denominators never count days that haven't happened.
  const elapsedDays = isCurrentWeek
    ? Math.min(daysBetween(monday, today) + 1, 7)
    : 7;

  const [
    currentRows,
    previousRows,
    intakeKcalTarget,
    gPerKg,
    latestWeight,
    currentFoodDays,
    previousFoodDays,
    currentSupplementDays,
    previousSupplementDays,
  ] = await Promise.all([
    getSummaryRange(monday, weekEnd),
    getSummaryRange(prevMonday, prevEnd),
    getIntakeKcalTarget(),
    getProteinGPerKg(),
    // Latest weight overall (adherence.ts's approach): the protein target is a
    // standing goal derived from the most recent measurement, not per-week.
    prisma.weightMeasurement.findFirst({
      orderBy: { measuredAt: "desc" },
      select: { weightKg: true },
    }),
    foodLoggedDays(monday, weekEnd),
    foodLoggedDays(prevMonday, prevEnd),
    supplementCompleteDays(monday, weekEnd),
    supplementCompleteDays(prevMonday, prevEnd),
  ]);

  const latestWeightKg = latestWeight ? Number(latestWeight.weightKg) : null;
  const proteinTargetG =
    latestWeightKg != null ? proteinTarget(latestWeightKg, gPerKg) : null;

  const current = summarizeWeek(currentRows, {
    elapsedDays,
    proteinTargetG,
    intakeKcalTarget,
    foodLoggedDays: currentFoodDays.length,
    supplementCompleteDays: currentSupplementDays.length,
  });
  const previous = summarizeWeek(previousRows, {
    elapsedDays: 7,
    proteinTargetG,
    intakeKcalTarget,
    foodLoggedDays: previousFoodDays.length,
    supplementCompleteDays: previousSupplementDays.length,
  });

  return {
    weekStart: monday,
    weekEnd,
    isCurrentWeek,
    current,
    previous,
    deltas: compareWeeks(current, previous),
    callouts: {
      bestSleepDay: pickExtreme(currentRows, "sleepScore", "max"),
      biggestVolumeDay: pickExtreme(currentRows, "liftingVolumeKg", "max"),
      worstReadinessDay: pickExtreme(currentRows, "readinessScore", "min"),
    },
  };
}
