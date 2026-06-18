import { EntryOrigin, type StimulantEntry } from "@/generated/prisma/client";
import { dayOf, dayToDbDate, todayLocal } from "@/lib/dates";
import {
  logStimulantSchema,
  type LogStimulantInput,
} from "@/lib/schemas/stimulant";
import { prisma } from "@/server/db";
import { getWaterStatus } from "./water";

/**
 * Logs a stimulant and returns the day's UPDATED water target (mL), read back from
 * the daily_summary view via getWaterStatus — the single source of the formula.
 */
export async function logStimulant(
  input: LogStimulantInput,
  origin: EntryOrigin,
): Promise<number> {
  const data = logStimulantSchema.parse(input);
  const at = data.loggedAt ? new Date(data.loggedAt) : new Date();
  const day = dayOf(at);
  await prisma.stimulantEntry.create({
    data: {
      amountMg: data.amountMg,
      substance: data.substance,
      notes: data.notes,
      loggedAt: at,
      day: dayToDbDate(day),
      origin,
    },
  });
  return (await getWaterStatus(day)).targetMl;
}

export function listByDay(
  day: string = todayLocal(),
): Promise<StimulantEntry[]> {
  return prisma.stimulantEntry.findMany({
    where: { day: dayToDbDate(day) },
    orderBy: { loggedAt: "desc" },
  });
}
