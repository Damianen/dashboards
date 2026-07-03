// Read-only insight tools: the day summary and briefing, metric trends,
// cross-domain observations, adherence, recovery, TDEE and the weight goal.

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { briefingModeSchema } from "@/lib/schemas/briefing";
import { daySchema } from "@/lib/schemas/common";
import {
  observationsWindowSchema,
  recoveryWindowSchema,
  tdeeWindowSchema,
} from "@/lib/schemas/insights";
import { trendMetricSchema } from "@/lib/schemas/summary";
import { getAdherence } from "@/server/services/adherence";
import { getBriefing } from "@/server/services/briefing";
import { getObservations } from "@/server/services/observations";
import { getRecovery } from "@/server/services/recovery";
import { getDailySummary, getTrends } from "@/server/services/summary";
import { getTdeeEstimate } from "@/server/services/tdee";
import { getWeightGoal } from "@/server/services/weight-goal";

import { ACTIVE_KCAL_CAVEAT, run } from "./shared";

export function registerInsightsTools(server: McpServer): void {
  server.registerTool(
    "get_daily_summary",
    {
      description:
        "The health summary for a day: weight, sleep, readiness, steps, intake " +
        "(kcal/protein/carb/fat), water vs target, caffeine, lifting volume, supplements. " +
        "caffeineMg is the UNIFIED daily total — stimulant entries + food entries (incl. " +
        "logged meals) + checked supplements — and is what the water target scales with; " +
        "stimulantMg is the stimulant-only subset. Caffeine never enters any calorie figure. " +
        `Returns null if no source data exists yet. ${ACTIVE_KCAL_CAVEAT}`,
      inputSchema: {
        day: daySchema
          .optional()
          .describe("Civil date YYYY-MM-DD (Europe/Amsterdam). Defaults to today."),
      },
    },
    ({ day }) => run(() => getDailySummary(day)),
  );

  server.registerTool(
    "get_daily_briefing",
    {
      description:
        "The composed daily briefing: mode 'morning' plans the day (sleep/recovery, " +
        "targets, suggested session, morning supplements, weight trend, newest " +
        "observation); 'evening' recaps it (water/protein/calories/training vs targets, " +
        "unfinished items) and plans tomorrow. Mode auto-selects by Amsterdam time when " +
        "omitted. Returns { day, mode, generatedAt, headline, sections } where EVERY " +
        "section is optional — an absent section means that data or feature is " +
        "unavailable; never fill gaps by guessing. sections.sleep may carry an earlier " +
        "day with isStale=true (report it as that day's data). The session suggestion " +
        "is an ADVISORY HEURISTIC banded from the user's own recovery/readiness trend — " +
        "not health or medical advice; it never blocks starting any workout and never " +
        "logs or modifies anything (tomorrow's suggestion necessarily uses today's " +
        "signal). Read-only.",
      inputSchema: {
        mode: briefingModeSchema
          .optional()
          .describe("morning | evening; omit to auto-select by time of day."),
      },
    },
    ({ mode }) => run(() => getBriefing(mode)),
  );

  server.registerTool(
    "get_trends",
    {
      description:
        "A single metric's daily series over the last N days (days with no value are " +
        `omitted). For active_kcal: ${ACTIVE_KCAL_CAVEAT}`,
      inputSchema: {
        metric: trendMetricSchema.describe("Which metric to chart."),
        days: z
          .number()
          .int()
          .min(1)
          .max(365)
          .default(30)
          .describe("How many days back, 1–365 (default 30)."),
      },
    },
    ({ metric, days }) => run(() => getTrends(metric, days)),
  );

  server.registerTool(
    "get_observations",
    {
      description:
        "Cross-domain OBSERVATIONS over a rolling window: late caffeine vs that night's " +
        "sleep, sleep vs next-day readiness, readiness vs same-day lifting volume, and the " +
        "7-day weight average vs sleep. Returns { windowDays, observations: [{ id, title, " +
        "finding, direction, strength (signed correlation, point-biserial for the caffeine " +
        "one), n, windowDays }] } ranked by |strength|. Each observation is a CORRELATIONAL " +
        "HYPOTHESIS with its sample size n stated — NOT established fact and NOT causal. " +
        "Treat them as hypotheses to investigate, always cite the n, avoid causal language " +
        "('tends to', not 'because'/'causes'), and NEVER use them to change a target. " +
        "Detectors with fewer than the minimum paired days are omitted entirely.",
      inputSchema: {
        window: observationsWindowSchema
          .optional()
          .describe("Rolling window in days, 14–180. Omit for the default (30)."),
      },
    },
    ({ window }) => run(() => getObservations(window)),
  );

  server.registerTool(
    "get_adherence",
    {
      description:
        "Adherence for a day: { day, protein, foodStreak, supplementStreak }. protein = " +
        "{ gPerKg, latestWeightKg, targetG, actualG, remainingG, pct } where targetG is the " +
        "INTAKE-ONLY protein goal (most recent Withings weight × the configured g/kg) and " +
        "actualG is the day's logged protein. This target is never netted against calories or " +
        "expenditure and never changes any other target (CLAUDE.md). Each streak = { length, " +
        "startDay, milestonesReached } over civil days: foodStreak counts a day with any logged " +
        "food; supplementStreak counts a day where every currently-active supplement was checked. " +
        "A still-unlogged today does not break a live streak. Read-only.",
      inputSchema: {
        day: daySchema
          .optional()
          .describe("Civil date YYYY-MM-DD (Europe/Amsterdam). Defaults to today."),
      },
    },
    ({ day }) => run(() => getAdherence(day)),
  );

  server.registerTool(
    "get_recovery_status",
    {
      description:
        "Recovery trend from Oura for a day: resting HR (night's lowest, bpm), HRV (main " +
        "sleep's average, ms) and body-temperature deviation (°C), each scored against a " +
        "rolling baseline (default 30 days). Returns { day, window, metrics: { restingHr, hrv, " +
        "tempDeviation } each { label, unit, direction, series, baseline (mean±sd) | null, " +
        "today, z, flag }, status, episodeStart, caveat }. flag ∈ none|elevated|high|" +
        "insufficient (elevated/high only in the BAD direction: HR↑, HRV↓, temp↑). status ∈ " +
        "normal|elevated|high|insufficient — 'high' when one metric is strongly off OR ≥2 " +
        "deviate together. This is a TREND SIGNAL and an early heads-up for possible " +
        "under-recovery or oncoming illness — NOT a diagnosis or medical advice. An " +
        "insufficient baseline yields no flag (never guess). Read-only.",
      inputSchema: {
        day: daySchema
          .optional()
          .describe("Civil date YYYY-MM-DD (Europe/Amsterdam). Defaults to today."),
        window: recoveryWindowSchema
          .optional()
          .describe("Baseline window in days, 14–90. Omit for the default (30)."),
      },
    },
    ({ day, window }) => run(() => getRecovery(day, window)),
  );

  server.registerTool(
    "get_tdee_estimate",
    {
      description:
        "Empirical TDEE — true maintenance calories — for a rolling window, derived ONLY " +
        "from logged intake and the measured weight trend (least-squares regression of " +
        "weight against time). maintenance = mean logged intake − weightChange→energy, so " +
        "losing weight ⇒ maintenance above intake, gaining ⇒ below. Returns { window, tdee " +
        "(kcal/day, null if not estimable), meanIntake, slopeKgPerWeek, nLoggedDays, nDays, " +
        "completeness, weightPointCount, confidence }. This is the HONEST energy balance: it " +
        "NEVER reads wearable/active calories and must NEVER be netted against device " +
        "expenditure. Confidence is driven by logging completeness — 'low' means under-logged " +
        "(missing food days bias the number HIGH); treat low-confidence estimates as rough and " +
        "do NOT set any calorie/macro target from them.",
      inputSchema: {
        window: tdeeWindowSchema
          .optional()
          .describe(
            "Rolling window in days: 14, 21, or 28. Omit to use the stored default (14).",
          ),
      },
    },
    ({ window }) => run(() => getTdeeEstimate(window)),
  );

  server.registerTool(
    "get_weight_goal",
    {
      description:
        "Body-weight goal status: the stored goal weight (kg), the current denoised " +
        "weight (7-day average), the measured weekly trend, and a projected ETA. Returns " +
        "{ goalKg, currentKg, slopeKgPerWeek, weeksToGoal, etaDay, onTrack, windowDays }. " +
        "onTrack=false with weeksToGoal/etaDay=null means the trend is flat or moving away " +
        "from the goal (no honest ETA). goalKg/onTrack are null until a goal is set. The " +
        "trend is weight-derived ONLY — it never nets against device/active calories.",
      inputSchema: {},
    },
    () => run(() => getWeightGoal()),
  );
}
