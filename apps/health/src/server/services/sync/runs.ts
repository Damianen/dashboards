import {
  type SyncRun,
  SyncSource,
  SyncStatus,
} from "@/generated/prisma/client";
import { dayOf, dayToDbDate, shiftDay } from "@/lib/dates";
import { prisma } from "@/server/db";

/**
 * The most recent sync run per source. Empty until a sync phase (Oura, Withings,
 * Google Health) lands and writes its first run. The local DB is the source of
 * truth — this only reports the latest attempt per feed.
 */
export async function getSyncStatus(): Promise<SyncRun[]> {
  const runs = await Promise.all(
    Object.values(SyncSource).map((source) =>
      prisma.syncRun.findFirst({
        where: { source },
        orderBy: { startedAt: "desc" },
      }),
    ),
  );
  return runs.filter((r): r is SyncRun => r !== null);
}

/** A closed-open date range, both ends civil days ("YYYY-MM-DD"), to pull from a vendor. */
export interface SyncWindow {
  startDate: string;
  endDate: string;
}

/**
 * The date range a sync should fetch. `endDate` is always today. The start anchors
 * on the last *successful* run's `windowEnd` minus `overlapDays` (a deliberate
 * re-fetch margin so a row that landed late upstream isn't missed); with no prior
 * OK run we backfill `backfillDays`. Pure — the watermark, today and the knobs are
 * all passed in, so this is exhaustively unit-testable. A future-dated watermark
 * (clock skew) is clamped so the window never inverts.
 */
export function computeSyncWindow(args: {
  lastOkWindowEnd: Date | null;
  today: string;
  overlapDays: number;
  backfillDays: number;
}): SyncWindow {
  const { lastOkWindowEnd, today, overlapDays, backfillDays } = args;
  const start = lastOkWindowEnd
    ? shiftDay(dayOf(lastOkWindowEnd), -overlapDays)
    : shiftDay(today, -backfillDays);
  return { startDate: start > today ? today : start, endDate: today };
}

/** Open a RUNNING run row stamped with the window it intends to cover. */
export function openSyncRun(
  source: SyncSource,
  window: SyncWindow,
): Promise<SyncRun> {
  return prisma.syncRun.create({
    data: {
      source,
      status: SyncStatus.RUNNING,
      windowStart: dayToDbDate(window.startDate),
      windowEnd: dayToDbDate(window.endDate),
    },
  });
}

/**
 * Close a run as OK. `note` lets a benign-but-incomplete run (e.g. a rate-limited
 * partial) record why it stopped early while still counting as a success so its
 * `windowEnd` advances the watermark — the overlap re-covers the gap next run.
 */
export function finishSyncRun(
  id: string,
  itemsUpserted: number,
  note?: string,
): Promise<SyncRun> {
  return prisma.syncRun.update({
    where: { id },
    data: {
      status: SyncStatus.OK,
      finishedAt: new Date(),
      itemsUpserted,
      error: note ?? null,
    },
  });
}

/** Close a run as ERROR, preserving whatever was upserted before the failure. */
export function failSyncRun(
  id: string,
  message: string,
  itemsUpserted: number,
): Promise<SyncRun> {
  return prisma.syncRun.update({
    where: { id },
    data: {
      status: SyncStatus.ERROR,
      finishedAt: new Date(),
      itemsUpserted,
      error: message,
    },
  });
}
