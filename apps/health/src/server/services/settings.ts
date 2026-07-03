import {
  briefingScheduleSchema,
  briefingSettingsSchema,
  modeCutoffHourSchema,
  suggestionThresholdsSchema,
  type BriefingSettings,
} from "@/lib/schemas/briefing";
import { tdeeWindowSchema, type TdeeWindow } from "@/lib/schemas/insights";
import {
  intakeTargetSchema,
  proteinSettingSchema,
  waterSettingsSchema,
  type WaterSettings,
  weightGoalSchema,
} from "@/lib/schemas/settings";
import {
  DEFAULT_BASE_TARGET_ML,
  DEFAULT_ML_PER_MG_STIMULANT,
} from "@/lib/water-defaults";
import { prisma } from "@/server/db";

/** The default protein factor (g/kg) when the setting has never been written. */
export const DEFAULT_PROTEIN_G_PER_KG = 2.0;

/** The configured protein-target factor (g/kg), or the default if unset. Mirrors the
 *  settings-read pattern in water.ts. */
export async function getProteinGPerKg(): Promise<number> {
  const setting = await prisma.setting.findUnique({
    where: { key: "protein.gPerKg" },
  });
  return setting ? Number(setting.value) : DEFAULT_PROTEIN_G_PER_KG;
}

/** Persist the protein-target factor (g/kg). Validates against the canonical schema. */
export async function setProteinGPerKg(gPerKg: number): Promise<number> {
  const { gPerKg: value } = proteinSettingSchema.parse({ gPerKg });
  await prisma.setting.upsert({
    where: { key: "protein.gPerKg" },
    create: { key: "protein.gPerKg", value },
    update: { value },
  });
  return value;
}

// The empirical-TDEE window is persisted as a single settings row (additive — no
// migration). Mirrors water.ts's getBaseTargetMl pattern: read with a hard-coded
// fallback so the feature works in prod even before the seed runs.
const TDEE_WINDOW_KEY = "tdee.windowDays";
const DEFAULT_TDEE_WINDOW: TdeeWindow = 14;

/** The stored TDEE window (14/21/28), or 14 when unset or somehow invalid. */
export async function getTdeeWindowDays(): Promise<TdeeWindow> {
  const setting = await prisma.setting.findUnique({
    where: { key: TDEE_WINDOW_KEY },
  });
  if (!setting) return DEFAULT_TDEE_WINDOW;
  const parsed = tdeeWindowSchema.safeParse(Number(setting.value));
  return parsed.success ? parsed.data : DEFAULT_TDEE_WINDOW;
}

/** Persist the default TDEE window. Input is validated by setTdeeWindowSchema upstream. */
export async function setTdeeWindowDays(windowDays: TdeeWindow): Promise<void> {
  await prisma.setting.upsert({
    where: { key: TDEE_WINDOW_KEY },
    update: { value: windowDays },
    create: { key: TDEE_WINDOW_KEY, value: windowDays },
  });
}

// Goal body weight (kg). Optional — null until the user sets one. Same additive
// settings-row pattern; no migration.
const WEIGHT_GOAL_KEY = "weight.goalKg";

/** The stored goal weight (kg), or null when never set. */
export async function getWeightGoalKg(): Promise<number | null> {
  const setting = await prisma.setting.findUnique({
    where: { key: WEIGHT_GOAL_KEY },
  });
  return setting ? Number(setting.value) : null;
}

/** Persist the goal weight (kg). Validates against the canonical schema. */
export async function setWeightGoalKg(goalKg: number): Promise<number> {
  const { goalKg: value } = weightGoalSchema.parse({ goalKg });
  await prisma.setting.upsert({
    where: { key: WEIGHT_GOAL_KEY },
    create: { key: WEIGHT_GOAL_KEY, value },
    update: { value },
  });
  return value;
}

// Daily intake calorie target (kcal). An intake-ONLY goal — never netted against
// expenditure (CLAUDE.md). Optional; null until set.
const INTAKE_TARGET_KEY = "intake.kcalTarget";

/** The stored daily intake calorie target (kcal), or null when never set. */
export async function getIntakeKcalTarget(): Promise<number | null> {
  const setting = await prisma.setting.findUnique({
    where: { key: INTAKE_TARGET_KEY },
  });
  return setting ? Number(setting.value) : null;
}

/** Persist the daily intake calorie target (kcal). Validates against the schema. */
export async function setIntakeKcalTarget(kcal: number): Promise<number> {
  const { kcal: value } = intakeTargetSchema.parse({ kcal });
  await prisma.setting.upsert({
    where: { key: INTAKE_TARGET_KEY },
    create: { key: INTAKE_TARGET_KEY, value },
    update: { value },
  });
  return value;
}

// The two water-target inputs. The formula stays solely in the daily_summary
// view (base + Σ stimulant mg × mlPerMg), which reads these settings live —
// writing them moves every day's target on the next read, no migration.
const WATER_BASE_KEY = "water.baseTargetMl";
const WATER_ML_PER_MG_KEY = "water.mlPerMgStimulant";

/** The stored water-target inputs, with the view's COALESCE defaults when unset. */
export async function getWaterSettings(): Promise<WaterSettings> {
  const rows = await prisma.setting.findMany({
    where: { key: { in: [WATER_BASE_KEY, WATER_ML_PER_MG_KEY] } },
  });
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const base = byKey.get(WATER_BASE_KEY);
  const perMg = byKey.get(WATER_ML_PER_MG_KEY);
  return {
    baseTargetMl: base == null ? DEFAULT_BASE_TARGET_ML : Number(base),
    mlPerMgStimulant:
      perMg == null ? DEFAULT_ML_PER_MG_STIMULANT : Number(perMg),
  };
}

/** Persist both water-target inputs atomically (one transaction — a partial
 *  save can't leave the pair inconsistent). Validates against the schema. */
export async function setWaterSettings(
  input: WaterSettings,
): Promise<WaterSettings> {
  const data = waterSettingsSchema.parse(input);
  await prisma.$transaction([
    prisma.setting.upsert({
      where: { key: WATER_BASE_KEY },
      create: { key: WATER_BASE_KEY, value: data.baseTargetMl },
      update: { value: data.baseTargetMl },
    }),
    prisma.setting.upsert({
      where: { key: WATER_ML_PER_MG_KEY },
      create: { key: WATER_ML_PER_MG_KEY, value: data.mlPerMgStimulant },
      update: { value: data.mlPerMgStimulant },
    }),
  ]);
  return data;
}

// Daily-briefing configuration across three settings rows (additive — no
// migration): the notification slots, the morning/evening mode cutoff, and the
// readiness thresholds behind the session suggestion.
const BRIEFING_SCHEDULE_KEY = "briefing.schedule";
const BRIEFING_CUTOFF_KEY = "briefing.modeCutoffHour";
const BRIEFING_THRESHOLDS_KEY = "briefing.thresholds";

/** Defaults when a row has never been written (or fails validation). */
export const BRIEFING_DEFAULTS: BriefingSettings = {
  morning: { enabled: true, time: "07:30" },
  evening: { enabled: true, time: "21:00" },
  modeCutoffHour: 15,
  thresholds: { goodMin: 75, moderateMin: 60 },
};

/** The stored briefing settings, each part falling back to its default when
 *  unset or somehow invalid (getTdeeWindowDays' safe-parse pattern). */
export async function getBriefingSettings(): Promise<BriefingSettings> {
  const rows = await prisma.setting.findMany({
    where: {
      key: { in: [BRIEFING_SCHEDULE_KEY, BRIEFING_CUTOFF_KEY, BRIEFING_THRESHOLDS_KEY] },
    },
  });
  const byKey = new Map(rows.map((r) => [r.key, r.value]));

  const schedule = briefingScheduleSchema.safeParse(byKey.get(BRIEFING_SCHEDULE_KEY));
  const cutoff = modeCutoffHourSchema.safeParse(byKey.get(BRIEFING_CUTOFF_KEY));
  const thresholds = suggestionThresholdsSchema.safeParse(
    byKey.get(BRIEFING_THRESHOLDS_KEY),
  );

  return {
    morning: schedule.success ? schedule.data.morning : BRIEFING_DEFAULTS.morning,
    evening: schedule.success ? schedule.data.evening : BRIEFING_DEFAULTS.evening,
    modeCutoffHour: cutoff.success ? cutoff.data : BRIEFING_DEFAULTS.modeCutoffHour,
    thresholds: thresholds.success ? thresholds.data : BRIEFING_DEFAULTS.thresholds,
  };
}

/** Persist all briefing settings atomically (one transaction across the three
 *  rows — a partial save can't leave them inconsistent). */
export async function setBriefingSettings(
  input: BriefingSettings,
): Promise<BriefingSettings> {
  const data = briefingSettingsSchema.parse(input);
  const schedule = { morning: data.morning, evening: data.evening };
  await prisma.$transaction([
    prisma.setting.upsert({
      where: { key: BRIEFING_SCHEDULE_KEY },
      create: { key: BRIEFING_SCHEDULE_KEY, value: schedule },
      update: { value: schedule },
    }),
    prisma.setting.upsert({
      where: { key: BRIEFING_CUTOFF_KEY },
      create: { key: BRIEFING_CUTOFF_KEY, value: data.modeCutoffHour },
      update: { value: data.modeCutoffHour },
    }),
    prisma.setting.upsert({
      where: { key: BRIEFING_THRESHOLDS_KEY },
      create: { key: BRIEFING_THRESHOLDS_KEY, value: data.thresholds },
      update: { value: data.thresholds },
    }),
  ]);
  return data;
}
