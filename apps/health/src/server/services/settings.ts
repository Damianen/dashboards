import { tdeeWindowSchema, type TdeeWindow } from "@/lib/schemas/insights";
import { proteinSettingSchema } from "@/lib/schemas/settings";
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
