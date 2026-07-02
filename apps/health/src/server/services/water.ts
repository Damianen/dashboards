import {
  EntryOrigin,
  Prisma,
  type WaterEntry,
} from "@/generated/prisma/client";
import { civilDay, dayOf, dayToDbDate, todayLocal } from "@/lib/dates";
import { logWaterSchema, type LogWaterInput } from "@/lib/schemas/water";
// Matches the daily_summary view's COALESCE default — used only as the no-data fallback.
import { DEFAULT_BASE_TARGET_ML } from "@/lib/water-defaults";
import { prisma } from "@/server/db";
import { NotFoundError } from "./errors";
import { getDailySummary } from "./summary";

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

/** A day's water entries, newest first — the list the Undo/delete flow works from. */
export function listWaterByDay(
  day: string = todayLocal(),
): Promise<WaterEntry[]> {
  return prisma.waterEntry.findMany({
    where: { day: dayToDbDate(day) },
    orderBy: { loggedAt: "desc" },
  });
}

/** Delete one water entry by id, returning the civil day it belonged to so
 *  callers can refresh that day's caches. */
export async function deleteWaterEntry(
  id: string,
): Promise<{ id: string; day: string }> {
  try {
    const row = await prisma.waterEntry.delete({ where: { id } });
    return { id: row.id, day: civilDay(row.day) };
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2025"
    ) {
      throw new NotFoundError("water entry", id);
    }
    throw err;
  }
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
