import { currentStreak, milestonesReached, proteinTarget } from "@/lib/adherence";
import { shiftDay, todayLocal } from "@/lib/dates";
import { prisma } from "@/server/db";
import {
  getIntakeKcalTarget,
  getProteinGPerKg,
} from "@/server/services/settings";
import { getDailySummary } from "@/server/services/summary";

// How far back the streak queries scan. 365 days comfortably covers the longest milestone
// (100) while staying a cheap distinct-day scan; a streak longer than this would be capped.
const STREAK_WINDOW_DAYS = 365;

/** Protein adherence for a day: an intake-only target vs what was actually logged. Never
 *  nets calories and never feeds another target (CLAUDE.md). All grams; null when there's
 *  no weight to derive a target from. */
export interface ProteinAdherence {
  /** g/kg factor in force. */
  gPerKg: number;
  /** Most recent Withings weight (kg), or null if none synced yet. */
  latestWeightKg: number | null;
  /** Target grams = latest weight × g/kg, or null without a weight. */
  targetG: number | null;
  /** Logged protein (g) for the day. */
  actualG: number;
  /** max(0, target − actual), or null without a target. */
  remainingG: number | null;
  /** actual / target as a 0–100 percentage (can exceed 100), or null without a target. */
  pct: number | null;
}

/** A streak as the client sees it: its current length, the milestones it has passed, and
 *  the civil day it started (null when there is no live streak). */
export interface StreakView {
  length: number;
  startDay: string | null;
  milestonesReached: number[];
}

/** Calorie adherence: an intake-ONLY target vs logged intake. Never an energy balance —
 *  `remaining` is target − intake, NEVER intake − expenditure (CLAUDE.md guardrail). All
 *  kcal; target null when the user hasn't set one. */
export interface CalorieAdherence {
  /** Configured daily intake target (kcal), or null when unset. */
  targetKcal: number | null;
  /** Logged intake (kcal) for the day. */
  actualKcal: number;
  /** max(0, target − actual), or null without a target. */
  remainingKcal: number | null;
  /** actual / target as a 0–100 percentage (can exceed 100), or null without a target. */
  pct: number | null;
}

export interface AdherenceResult {
  day: string;
  protein: ProteinAdherence;
  /** Intake calorie target vs logged intake (intake-only; never netted). */
  calories: CalorieAdherence;
  /** A day counts toward this streak if it has any logged food. */
  foodStreak: StreakView;
  /** A day counts if every currently-active supplement was checked that day. */
  supplementStreak: StreakView;
}

function toStreakView(days: string[], today: string): StreakView {
  const { length, startDay } = currentStreak(days, today);
  return { length, startDay, milestonesReached: milestonesReached(length) };
}

/** Civil days in [start, end] (inclusive) that have at least one food entry. */
async function foodLoggedDays(start: string, end: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ day: string }[]>`
    SELECT DISTINCT day::text AS "day"
    FROM food_entries
    WHERE day BETWEEN ${start}::date AND ${end}::date
  `;
  return rows.map((r) => r.day);
}

/**
 * Civil days in [start, end] on which EVERY currently-active supplement was checked. Compares
 * against the current active set (archived = false) — the same notion of "complete" the daily
 * checklist uses, since no historical active-set is recorded. With no active supplements there
 * is nothing to complete, so the streak is empty.
 */
async function supplementCompleteDays(
  start: string,
  end: string,
): Promise<string[]> {
  const activeCount = await prisma.supplement.count({
    where: { archived: false },
  });
  if (activeCount === 0) return [];
  const rows = await prisma.$queryRaw<{ day: string }[]>`
    SELECT l.day::text AS "day"
    FROM supplement_logs l
    JOIN supplements s ON s.id = l.supplement_id AND s.archived = false
    WHERE l.day BETWEEN ${start}::date AND ${end}::date
    GROUP BY l.day
    HAVING COUNT(DISTINCT l.supplement_id) = ${activeCount}
  `;
  return rows.map((r) => r.day);
}

/**
 * The adherence snapshot for a day: the protein target (from the latest weight × g/kg) vs the
 * day's logged protein, plus the current food-logging and supplement-completion streaks. The
 * target uses the most recent weight overall, not the requested day's — it's a standing goal,
 * not a per-day historical figure.
 */
export async function getAdherence(
  day: string = todayLocal(),
): Promise<AdherenceResult> {
  const start = shiftDay(day, -(STREAK_WINDOW_DAYS - 1));

  const [latest, gPerKg, kcalTarget, summary, foodDays, supplementDays] =
    await Promise.all([
      prisma.weightMeasurement.findFirst({
        orderBy: { measuredAt: "desc" },
        select: { weightKg: true },
      }),
      getProteinGPerKg(),
      getIntakeKcalTarget(),
      getDailySummary(day),
      foodLoggedDays(start, day),
      supplementCompleteDays(start, day),
    ]);

  const latestWeightKg = latest ? Number(latest.weightKg) : null;
  const actualG = summary?.proteinG ?? 0;
  const targetG =
    latestWeightKg != null ? proteinTarget(latestWeightKg, gPerKg) : null;
  const remainingG = targetG != null ? Math.max(0, targetG - actualG) : null;
  const pct =
    targetG != null && targetG > 0
      ? Math.round((actualG / targetG) * 100)
      : null;

  const actualKcal = summary?.intakeKcal ?? 0;
  const remainingKcal =
    kcalTarget != null ? Math.max(0, kcalTarget - actualKcal) : null;
  const kcalPct =
    kcalTarget != null && kcalTarget > 0
      ? Math.round((actualKcal / kcalTarget) * 100)
      : null;

  return {
    day,
    protein: { gPerKg, latestWeightKg, targetG, actualG, remainingG, pct },
    calories: {
      targetKcal: kcalTarget,
      actualKcal,
      remainingKcal,
      pct: kcalPct,
    },
    foodStreak: toStreakView(foodDays, day),
    supplementStreak: toStreakView(supplementDays, day),
  };
}
