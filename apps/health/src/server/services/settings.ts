import { tdeeWindowSchema, type TdeeWindow } from "@/lib/schemas/insights";
import { prisma } from "@/server/db";

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
