import type { SleepSession } from "@/generated/prisma/client";
import { civilDay, dayOf, dayToDbDate } from "@/lib/dates";
import { logSleepSchema, type LogSleepInput } from "@/lib/schemas/sleep";
import { resolveSleepWindow } from "@/lib/sleep-entry";
import { prisma } from "@/server/db";
import { DomainError, NotFoundError } from "./errors";

/**
 * Log a manual sleep entry — the fallback for nights Oura missed. Stored with
 * source MANUAL and NO externalId, so the Oura sync's upserts (keyed on
 * externalId) can never touch it; the daily_summary view sums the day's
 * sleep_sessions regardless of source. Every score/stage/HR column stays null —
 * those are Oura measurements, never fabricated. `day` is the WAKE day
 * (Amsterdam civil day of bedtimeEnd), matching Oura's wake-morning bucketing.
 *
 * Guard: refused when Oura already has a session that day — manual entries fill
 * gaps, they never double-count a synced night. Multiple MANUAL rows per day
 * are fine (naps); the view sums them.
 */
export async function logSleep(input: LogSleepInput): Promise<SleepSession> {
  const data = logSleepSchema.parse(input);
  const { bedtimeStart, bedtimeEnd, totalSleepMin } = resolveSleepWindow(
    data,
    new Date(),
  );
  const day = dayOf(bedtimeEnd);
  const ouraSession = await prisma.sleepSession.findFirst({
    where: { day: dayToDbDate(day), source: "OURA" },
    select: { id: true },
  });
  if (ouraSession) {
    throw new DomainError(
      `Oura already recorded sleep for ${day} — manual entries are only for days Oura missed.`,
    );
  }
  return prisma.sleepSession.create({
    data: {
      day: dayToDbDate(day),
      bedtimeStart,
      bedtimeEnd,
      totalSleepMin,
      source: "MANUAL",
    },
  });
}

/**
 * Delete one MANUAL sleep entry by id (undo a mistaken log). Synced sessions
 * are refused — the local DB is the source of truth for wearable history and
 * the next sync would just re-upsert them anyway. Returns the entry's civil
 * day so callers can refresh that day's caches.
 */
export async function deleteSleep(
  id: string,
): Promise<{ id: string; day: string }> {
  const row = await prisma.sleepSession.findUnique({ where: { id } });
  if (!row) throw new NotFoundError("sleep entry", id);
  if (row.source !== "MANUAL") {
    throw new DomainError("synced sleep can't be deleted");
  }
  await prisma.sleepSession.delete({ where: { id } });
  return { id: row.id, day: civilDay(row.day) };
}
