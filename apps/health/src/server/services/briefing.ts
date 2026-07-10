// The Daily Briefing composition service: a READ layer that assembles the
// morning/evening overview by CALLING the existing services — targets, TDEE,
// recovery, observations and rotation math all stay in their single homes.
// A section whose data (or feature) is unavailable is OMITTED, never
// fabricated; a failing read logs and drops that section, never the briefing.
// Never computes intake − expenditure (CLAUDE.md).

import {
  eveningHeadline,
  morningHeadline,
  resolveMode,
  SUGGESTION_CAVEAT,
  suggestSession,
  type Briefing,
  type BriefingSections,
  type SleepSection,
  type SuggestedSessionSection,
} from "@/lib/briefing";
import { shiftDay, timeOfDay, todayLocal } from "@/lib/dates";
import { round1 } from "@/lib/round";
import type { BriefingMode, SuggestionThresholds } from "@/lib/schemas/briefing";
import { getAdherence } from "@/server/services/adherence";
import { getGoalStatus } from "@/server/services/goals";
import { listSessions } from "@/server/services/lifting";
import { getFreshObservation } from "@/server/services/observations";
import { getRecovery, RECOVERY_CAVEAT } from "@/server/services/recovery";
import { getNextSession, type NextSessionResult } from "@/server/services/rotation";
import { getBriefingSettings } from "@/server/services/settings";
import { getDailySummary, type DailySummary } from "@/server/services/summary";
import { getChecklist } from "@/server/services/supplements";
import { getTdeeEstimate } from "@/server/services/tdee";
import { getWaterStatus } from "@/server/services/water";

/** How many days back readiness/sleep may lag before we give up on a sleep section. */
const SLEEP_LOOKBACK_DAYS = 2;

/** Composition resilience: a failing section read is logged and omitted. */
async function orNull<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    console.error(`[briefing] ${label} read failed`, err);
    return null;
  }
}

/**
 * Sleep + readiness with a short lookback: when today's Oura data hasn't landed
 * yet, use the most recent day (≤ 2 back) that has it and mark it stale — the
 * UI labels the data's day rather than pretending it's fresh. A manual sleep
 * entry (Oura-outage fallback) has a duration but no scores, so totalSleepMin
 * alone also qualifies — the section then renders with null scores.
 */
async function composeSleep(
  day: string,
  todaySummary: DailySummary | null,
): Promise<SleepSection | null> {
  for (let back = 0; back <= SLEEP_LOOKBACK_DAYS; back++) {
    const candidateDay = back === 0 ? day : shiftDay(day, -back);
    const summary =
      back === 0
        ? todaySummary
        : await orNull("sleep-lookback", () => getDailySummary(candidateDay));
    if (
      summary &&
      (summary.sleepScore != null ||
        summary.readinessScore != null ||
        summary.totalSleepMin != null)
    ) {
      const recovery = await orNull("recovery", () => getRecovery(candidateDay));
      return {
        day: candidateDay,
        isStale: candidateDay !== day,
        sleepScore: summary.sleepScore,
        totalSleepMin: summary.totalSleepMin,
        readinessScore: summary.readinessScore,
        recoveryStatus: recovery?.status ?? null,
        caveat: RECOVERY_CAVEAT,
      };
    }
  }
  return null;
}

/**
 * The advisory session block for a rotation slot. Present even without a
 * rotation (suggestion: null) so the UI can show the "set up your split" hint —
 * the one deliberate exception to omit-when-missing.
 */
function suggestionSection(
  next: NextSessionResult | null,
  sleep: SleepSection | null,
  thresholds: SuggestionThresholds,
): SuggestedSessionSection {
  if (next === null) return { suggestion: null, caveat: SUGGESTION_CAVEAT };
  const suggestion = suggestSession({
    nextEntry: next.entry,
    recoveryStatus: sleep?.recoveryStatus,
    readinessScore: sleep?.readinessScore,
    thresholds,
  });
  return {
    suggestion: {
      ...suggestion,
      templateName: next.templateName,
      templateArchived: next.templateArchived,
      rotationIndex: next.index,
    },
    caveat: SUGGESTION_CAVEAT,
  };
}

/**
 * Compose the briefing for `day`. Mode defaults by Amsterdam wall clock against
 * the configured cutoff. Morning plans the day; evening recaps it against the
 * same daily_summary/adherence numbers the Today cards read, then plans
 * tomorrow (tomorrow's suggestion necessarily uses today's latest
 * recovery/readiness signal — tomorrow's doesn't exist yet).
 */
export async function getBriefing(
  mode?: BriefingMode,
  day: string = todayLocal(),
): Promise<Briefing> {
  const settings = await getBriefingSettings();
  const resolvedMode: BriefingMode =
    mode ?? resolveMode(timeOfDay(new Date()), settings.modeCutoffHour);

  const [summary, waterStatus, adherence, checklist] = await Promise.all([
    orNull("summary", () => getDailySummary(day)),
    orNull("water", () => getWaterStatus(day)),
    orNull("adherence", () => getAdherence(day)),
    orNull("supplements", () => getChecklist(day)),
  ]);
  const sleep = await composeSleep(day, summary);

  const sections: BriefingSections = {};

  if (resolvedMode === "morning") {
    const [tdee, priorSummary, nextSession, observation, goalStatus] =
      await Promise.all([
        orNull("tdee", () => getTdeeEstimate()),
        orNull("weight-prior", () => getDailySummary(shiftDay(day, -7))),
        orNull("rotation", () => getNextSession(day)),
        orNull("observation", () => getFreshObservation()),
        orNull("goal", () => getGoalStatus()),
      ]);

    if (sleep) sections.sleep = sleep;

    if (waterStatus) {
      sections.targets = {
        waterTargetMl: waterStatus.targetMl,
        caffeineMg: summary?.caffeineMg ?? null,
        proteinTargetG: adherence?.protein.targetG ?? null,
        intakeKcalTarget: adherence?.calories.targetKcal ?? null,
        tdeeKcal: tdee?.tdee ?? null,
        tdeeConfidence: tdee?.tdee != null ? tdee.confidence : null,
      };
    }

    // Only an ACTIVE goal earns a section — its stored target, the phase, and
    // whether a weekly proposal awaits a decision. Omitted otherwise.
    if (goalStatus?.goal) {
      sections.goal = {
        phase: goalStatus.goal.phase,
        goalWeightKg: goalStatus.goal.goalWeightKg,
        trendWeightKg: goalStatus.goal.trendWeightKg,
        targetKcal: goalStatus.goal.currentTargetKcal,
        plannedRateKgPerWeek: goalStatus.goal.plannedRateKgPerWeek,
        paused: goalStatus.goal.paused,
        pendingCheckIn: goalStatus.checkIns.some(
          (c) => c.status === "PROPOSED",
        ),
      };
    }

    sections.session = suggestionSection(nextSession, sleep, settings.thresholds);

    const morningGroup = checklist?.find((g) => g.timeGroup === "MORNING");
    if (morningGroup && morningGroup.total > 0) {
      sections.supplements = {
        timeGroup: morningGroup.timeGroup,
        doneCount: morningGroup.doneCount,
        total: morningGroup.total,
      };
    }

    if (summary && (summary.weight7dAvg != null || summary.weightKg != null)) {
      sections.weightTrend = {
        latestKg: summary.weightKg,
        avg7dKg: summary.weight7dAvg,
        // Same-column delta vs a week ago (the weeklySummary idiom) — display
        // arithmetic over the view's own 7d average, not new trend math.
        delta7dKg:
          summary.weight7dAvg != null && priorSummary?.weight7dAvg != null
            ? round1(summary.weight7dAvg - priorSummary.weight7dAvg)
            : null,
      };
    }

    if (observation) {
      sections.observation = {
        title: observation.title,
        finding: observation.finding,
        n: observation.n,
      };
    }
  } else {
    const tomorrowDay = shiftDay(day, 1);
    const [sessions, nextTomorrow] = await Promise.all([
      orNull("sessions", () => listSessions(day)),
      orNull("rotation", () => getNextSession(tomorrowDay)),
    ]);

    if (waterStatus && adherence) {
      const done = (sessions?.length ?? 0) > 0;
      sections.recap = {
        water: { ml: waterStatus.waterMl, targetMl: waterStatus.targetMl },
        protein: {
          actualG: adherence.protein.actualG,
          targetG: adherence.protein.targetG,
        },
        calories: {
          actualKcal: adherence.calories.actualKcal,
          targetKcal: adherence.calories.targetKcal,
        },
        training: {
          done,
          volumeKg:
            done && sessions
              ? round1(sessions.reduce((sum, s) => sum + s.volumeKg, 0))
              : null,
          workingSets:
            done && sessions
              ? sessions.reduce((sum, s) => sum + s.workingSets, 0)
              : null,
        },
      };
    }

    const supplementGroups = (checklist ?? [])
      .filter((g) => g.total > 0 && g.doneCount < g.total)
      .map((g) => ({ timeGroup: g.timeGroup, remaining: g.total - g.doneCount }));
    const waterShortfallMl =
      waterStatus && waterStatus.remainingMl > 0 ? waterStatus.remainingMl : null;
    if (supplementGroups.length > 0 || waterShortfallMl != null) {
      sections.unfinished = { supplementGroups, waterShortfallMl };
    }

    const tomorrow = suggestionSection(nextTomorrow, sleep, settings.thresholds);
    const preWorkout = checklist?.find((g) => g.timeGroup === "PRE_WORKOUT");
    const trainingTomorrow =
      tomorrow.suggestion != null && tomorrow.suggestion.kind !== "REST";
    sections.tomorrow = {
      ...tomorrow,
      day: tomorrowDay,
      prepLine:
        trainingTomorrow && preWorkout && preWorkout.total > 0
          ? "Training day tomorrow — check off your pre-workout supplements before the session."
          : null,
    };
  }

  return {
    day,
    mode: resolvedMode,
    generatedAt: new Date().toISOString(),
    headline:
      resolvedMode === "morning"
        ? morningHeadline(sections)
        : eveningHeadline(sections),
    sections,
  };
}
