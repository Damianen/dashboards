import { EntryOrigin, type WaterEntry } from "@/generated/prisma/client";
import { dayOf, dayToDbDate, todayLocal } from "@/lib/dates";
import { logWaterSchema, type LogWaterInput } from "@/lib/schemas/water";
import { prisma } from "@/server/db";
import { getDailySummary } from "./summary";

// Matches the daily_summary view's COALESCE default — used only as the no-data fallback.
const DEFAULT_BASE_TARGET_ML = 2500;

export async function logWater(
  input: LogWaterInput,
  origin: EntryOrigin,
): Promise<WaterEntry> {
  const data = logWaterSchema.parse(input);
  const at = data.loggedAt ? new Date(data.loggedAt) : new Date();
  return prisma.waterEntry.create({
    data: {
      amountMl: data.amountMl,
      loggedAt: at,
      day: dayToDbDate(dayOf(at)),
      origin,
    },
  });
}

export interface WaterStatus {
  day: string;
  waterMl: number;
  targetMl: number;
  remainingMl: number;
}

export async function getWaterStatus(
  day: string = todayLocal(),
): Promise<WaterStatus> {
  const summary = await getDailySummary(day);
  // The SQL view is the single source of the target formula. Only fall back to the
  // bare base setting when the day has no row at all (no stimulants → target = base).
  const targetMl = summary?.waterTargetMl ?? (await getBaseTargetMl());
  const waterMl = summary?.waterMl ?? 0;
  return {
    day,
    waterMl,
    targetMl,
    remainingMl: Math.max(0, targetMl - waterMl),
  };
}

async function getBaseTargetMl(): Promise<number> {
  const setting = await prisma.setting.findUnique({
    where: { key: "water.baseTargetMl" },
  });
  return setting ? Number(setting.value) : DEFAULT_BASE_TARGET_ML;
}
