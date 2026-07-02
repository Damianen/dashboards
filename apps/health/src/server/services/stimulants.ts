import {
  EntryOrigin,
  Prisma,
  type StimulantEntry,
} from "@/generated/prisma/client";
import { civilDay, dayOf, dayToDbDate, todayLocal } from "@/lib/dates";
import {
  logStimulantSchema,
  type LogStimulantInput,
} from "@/lib/schemas/stimulant";
import { prisma } from "@/server/db";
import { NotFoundError } from "./errors";
import { getWaterStatus } from "./water";

export interface LoggedStimulant {
  entry: StimulantEntry;
  waterTargetMl: number;
}

/**
 * Logs a stimulant and returns the created entry (so callers can offer Undo)
 * plus the day's UPDATED water target (mL), read back from the daily_summary
 * view via getWaterStatus — the single source of the formula.
 */
export async function logStimulant(
  input: LogStimulantInput,
  origin: EntryOrigin,
): Promise<LoggedStimulant> {
  const data = logStimulantSchema.parse(input);
  const at = data.loggedAt ? new Date(data.loggedAt) : new Date();
  const day = dayOf(at);
  const entry = await prisma.stimulantEntry.create({
    data: {
      amountMg: data.amountMg,
      substance: data.substance,
      notes: data.notes,
      loggedAt: at,
      day: dayToDbDate(day),
      origin,
    },
  });
  return { entry, waterTargetMl: (await getWaterStatus(day)).targetMl };
}

export function listByDay(
  day: string = todayLocal(),
): Promise<StimulantEntry[]> {
  return prisma.stimulantEntry.findMany({
    where: { day: dayToDbDate(day) },
    orderBy: { loggedAt: "desc" },
  });
}

/**
 * Delete one stimulant entry by id. Returns the entry's civil day and that day's
 * recomputed (now lower) water target — like logging, the formula stays solely
 * in the daily_summary view; this just reads the new value back.
 */
export async function deleteStimulantEntry(
  id: string,
): Promise<{ id: string; day: string; waterTargetMl: number }> {
  try {
    const row = await prisma.stimulantEntry.delete({ where: { id } });
    const day = civilDay(row.day);
    return {
      id: row.id,
      day,
      waterTargetMl: (await getWaterStatus(day)).targetMl,
    };
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2025"
    ) {
      throw new NotFoundError("stimulant entry", id);
    }
    throw err;
  }
}
