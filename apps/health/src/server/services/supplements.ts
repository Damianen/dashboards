import { EntryOrigin, type SupplementEntry } from "@/generated/prisma/client";
import { dayOf, dayToDbDate, todayLocal } from "@/lib/dates";
import {
  logSupplementSchema,
  type LogSupplementInput,
} from "@/lib/schemas/supplement";
import { prisma } from "@/server/db";

export async function logSupplement(
  input: LogSupplementInput,
  origin: EntryOrigin,
): Promise<SupplementEntry> {
  const data = logSupplementSchema.parse(input);
  const at = data.loggedAt ? new Date(data.loggedAt) : new Date();
  return prisma.supplementEntry.create({
    data: {
      name: data.name,
      dose: data.dose,
      unit: data.unit,
      loggedAt: at,
      day: dayToDbDate(dayOf(at)),
      origin,
    },
  });
}

export function listByDay(
  day: string = todayLocal(),
): Promise<SupplementEntry[]> {
  return prisma.supplementEntry.findMany({
    where: { day: dayToDbDate(day) },
    orderBy: { loggedAt: "desc" },
  });
}

/** Most-recently-used distinct supplement names, for the quick-log datalist. */
export async function listRecentNames(limit = 20): Promise<string[]> {
  const rows = await prisma.supplementEntry.findMany({
    distinct: ["name"],
    select: { name: true },
    orderBy: { loggedAt: "desc" },
    take: limit,
  });
  return rows.map((r) => r.name);
}
