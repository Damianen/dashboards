import { tdeeWindowSchema, type TdeeWindow } from "@/lib/schemas/insights";
import {
  intakeTargetSchema,
  proteinSettingSchema,
  weightGoalSchema,
} from "@/lib/schemas/settings";
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
