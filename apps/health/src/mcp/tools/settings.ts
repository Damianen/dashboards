// Settings tools: one aggregate read plus explicit, single-purpose setters for
// every user-configurable target. Setters reuse the canonical schemas the
// settings routes validate with, and their descriptions require confirming
// with the user before changing anything.

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { briefingSettingsSchema, rotationSchema } from "@/lib/schemas/briefing";
import { setTdeeWindowSchema } from "@/lib/schemas/insights";
import {
  intakeTargetSchema,
  proteinSettingSchema,
  waterSettingsSchema,
  weightGoalSchema,
} from "@/lib/schemas/settings";
import { getRotation, setRotation } from "@/server/services/rotation";
import {
  getBriefingSettings,
  getIntakeKcalTarget,
  getProteinGPerKg,
  getTdeeWindowDays,
  getWaterSettings,
  getWeightGoalKg,
  setBriefingSettings,
  setIntakeKcalTarget,
  setProteinGPerKg,
  setTdeeWindowDays,
  setWaterSettings,
  setWeightGoalKg,
} from "@/server/services/settings";

import { run } from "./shared";

export function registerSettingsTools(server: McpServer): void {
  server.registerTool(
    "get_settings",
    {
      description:
        "Every user-configurable setting in one read: proteinGPerKg (protein " +
        "target factor), intakeKcalTarget (daily intake-ONLY kcal goal; null " +
        "until set), weightGoalKg (null until set), water ({ baseTargetMl, " +
        "mlPerMgStimulant } — the two water-target inputs), tdeeWindowDays " +
        "(14/21/28), briefing ({ morning, evening, modeCutoffHour, thresholds }) " +
        "and rotation ({ entries } — the ordered workout rotation with template " +
        "names and archived flags). Read this BEFORE any set_* call, especially " +
        "the full-replace ones (set_briefing_settings, set_workout_rotation).",
      inputSchema: {},
    },
    () =>
      run(async () => {
        const [
          proteinGPerKg,
          intakeKcalTarget,
          weightGoalKg,
          water,
          tdeeWindowDays,
          briefing,
          rotation,
        ] = await Promise.all([
          getProteinGPerKg(),
          getIntakeKcalTarget(),
          getWeightGoalKg(),
          getWaterSettings(),
          getTdeeWindowDays(),
          getBriefingSettings(),
          getRotation(),
        ]);
        return {
          proteinGPerKg,
          intakeKcalTarget,
          weightGoalKg,
          water,
          tdeeWindowDays,
          briefing,
          rotation,
        };
      }),
  );

  server.registerTool(
    "set_protein_target",
    {
      description:
        "Set the protein-target factor in grams per kg of bodyweight (0.1–10). " +
        "The daily protein target becomes the most recent weight × this factor " +
        "(see get_adherence). Confirm with the user before changing targets. " +
        "Returns the stored value.",
      inputSchema: {
        g_per_kg: proteinSettingSchema.shape.gPerKg.describe(
          "Protein factor in g per kg bodyweight (0.1–10).",
        ),
      },
    },
    ({ g_per_kg }) =>
      run(async () => ({ gPerKg: await setProteinGPerKg(g_per_kg) })),
  );

  server.registerTool(
    "set_intake_target",
    {
      description:
        "Set the daily intake calorie target in kcal (500–10000). This is an " +
        "intake-ONLY goal: NEVER derive it by netting TDEE, wearable " +
        "expenditure or any 'deficit' math (the no-net-calories guardrail) — if " +
        "the user wants a TDEE-informed target, THEY pick the number. Confirm " +
        "with the user before changing targets. Returns the stored value.",
      inputSchema: {
        kcal: intakeTargetSchema.shape.kcal.describe(
          "Daily intake target in kcal (500–10000).",
        ),
      },
    },
    ({ kcal }) => run(async () => ({ kcal: await setIntakeKcalTarget(kcal) })),
  );

  server.registerTool(
    "set_weight_goal",
    {
      description:
        "Set the goal body weight in kg (20–500). Drives get_weight_goal's ETA " +
        "and the weight card. Confirm with the user before changing targets. " +
        "Returns the stored value.",
      inputSchema: {
        goal_kg: weightGoalSchema.shape.goalKg.describe(
          "Goal body weight in kilograms (20–500).",
        ),
      },
    },
    ({ goal_kg }) =>
      run(async () => ({ goalKg: await setWeightGoalKg(goal_kg) })),
  );

  server.registerTool(
    "set_water_settings",
    {
      description:
        "Set BOTH water-target inputs as one atomic pair (both required): " +
        "target_ml(day) = base_target_ml + Σ(day's stimulant mg) × " +
        "ml_per_mg_stimulant. ml_per_mg_stimulant: 0 disables the caffeine " +
        "adjustment. The target is computed live from these settings, so every " +
        "day's target (past days included) moves on the next read. Confirm with " +
        "the user before changing targets. Returns the stored pair.",
      inputSchema: {
        base_target_ml: waterSettingsSchema.shape.baseTargetMl.describe(
          "Base daily water target in mL (500–6000).",
        ),
        ml_per_mg_stimulant: waterSettingsSchema.shape.mlPerMgStimulant.describe(
          "Extra mL of target per mg of stimulant logged that day (0–5; 0 disables).",
        ),
      },
    },
    ({ base_target_ml, ml_per_mg_stimulant }) =>
      run(() =>
        setWaterSettings({
          baseTargetMl: base_target_ml,
          mlPerMgStimulant: ml_per_mg_stimulant,
        }),
      ),
  );

  server.registerTool(
    "set_briefing_settings",
    {
      description:
        "Replace ALL daily-briefing settings atomically — the FULL object is " +
        "required every time (FULL REPLACE: read get_settings first, modify, " +
        "send the complete new object): morning/evening push slots ({ enabled, " +
        "time 'HH:MM' Amsterdam wall clock }), mode_cutoff_hour (0–23; before " +
        "it the briefing defaults to morning mode, from it onward evening) and " +
        "thresholds ({ goodMin, moderateMin } readiness bands for the session " +
        "suggestion; moderateMin must be below goodMin). Controls when briefing " +
        "pushes fire. Confirm with the user before changing these. Returns the " +
        "stored settings.",
      inputSchema: {
        // The canonical nested shapes (camelCase keys), shared with the PATCH
        // /api/settings/briefing route — pass them through as-is.
        morning: briefingSettingsSchema.shape.morning.describe(
          "Morning slot: { enabled, time } — time is 24h 'HH:MM' (Amsterdam).",
        ),
        evening: briefingSettingsSchema.shape.evening.describe(
          "Evening slot: { enabled, time } — time is 24h 'HH:MM' (Amsterdam).",
        ),
        mode_cutoff_hour: briefingSettingsSchema.shape.modeCutoffHour.describe(
          "Hour (0–23) splitting morning-mode from evening-mode defaults.",
        ),
        thresholds: briefingSettingsSchema.shape.thresholds.describe(
          "Readiness bands: { goodMin, moderateMin } (1–100, moderateMin < goodMin).",
        ),
      },
    },
    ({ morning, evening, mode_cutoff_hour, thresholds }) =>
      run(() =>
        setBriefingSettings({
          morning,
          evening,
          modeCutoffHour: mode_cutoff_hour,
          thresholds,
        }),
      ),
  );

  server.registerTool(
    "set_workout_rotation",
    {
      description:
        "Replace the workout rotation — the ordered template/rest cycle behind " +
        "the briefing's suggested session. FULL REPLACE: read get_settings " +
        "first and send the complete new list. entries: up to 14 of " +
        '{ kind: "TEMPLATE", templateId } or { kind: "REST" }; an empty list ' +
        "clears the rotation. Template ids come from list_workout_templates — " +
        "unknown ids error cleanly and save NOTHING (archived templates are " +
        "allowed but flagged). Confirm with the user before changing it. " +
        "Returns the stored rotation with template names.",
      inputSchema: {
        // rotationSchema verbatim (camelCase templateId), shared with the
        // PATCH /api/settings/rotation route.
        entries: rotationSchema.shape.entries.describe(
          'The full ordered rotation, e.g. [{ kind: "TEMPLATE", templateId }, ' +
            '{ kind: "REST" }].',
        ),
      },
    },
    ({ entries }) => run(() => setRotation({ entries })),
  );

  server.registerTool(
    "set_tdee_window",
    {
      description:
        "Set the default empirical-TDEE rolling window: 14, 21 or 28 days " +
        "(shorter reacts faster but is noisier). Affects get_tdee_estimate's " +
        "default and the insights UI. A low-confidence TDEE estimate " +
        "(under-logged days bias it HIGH) must never drive target changes — do " +
        "not chain this into set_intake_target without the user deciding. " +
        "Confirm with the user before changing settings. Returns the stored " +
        "window.",
      inputSchema: {
        window_days: setTdeeWindowSchema.shape.windowDays.describe(
          "Rolling window in days: exactly 14, 21, or 28.",
        ),
      },
    },
    ({ window_days }) =>
      run(async () => {
        await setTdeeWindowDays(window_days);
        return { windowDays: window_days };
      }),
  );
}
