import { Prisma, Source, SyncSource } from "@/generated/prisma/client";
import { dayToDbDate, todayLocal } from "@/lib/dates";
import { prisma } from "@/server/db";
import {
  fetchDailyReadiness,
  fetchDailySleep,
  fetchSleep,
  type OuraDailyReadinessRecord,
  type OuraDailySleepRecord,
  type OuraSleepRecord,
  OuraRateLimitError,
} from "@/server/integrations/oura";
import {
  computeSyncWindow,
  failSyncRun,
  finishSyncRun,
  openSyncRun,
} from "./runs";

// A fresh ring with no prior OK run backfills this many days; incremental runs use a
// fixed re-fetch overlap so a late-arriving day upstream is never skipped.
const OVERLAP_DAYS = 3;
function backfillDays(): number {
  return Number(process.env.SYNC_BACKFILL_DAYS ?? 90);
}

/** Oura reports durations in seconds; every `*Min` column stores whole minutes. */
function secToMin(sec: number | null): number | null {
  return sec == null ? null : Math.round(sec / 60);
}

/**
 * Map an Oura sleep period to a SleepSession row. Oura's `day` is the civil day Oura
 * itself assigns the period to — it passes straight through dayToDbDate(), never dayOf()
 * (which is only for bucketing raw instants). The caller filters out periods with no
 * total_sleep_duration, so totalSleepMin is always real here. latencySec stays seconds.
 */
export function toSleepSessionData(
  r: OuraSleepRecord,
): Prisma.SleepSessionUncheckedCreateInput {
  return {
    externalId: r.id,
    day: dayToDbDate(r.day),
    bedtimeStart: new Date(r.bedtime_start),
    bedtimeEnd: new Date(r.bedtime_end),
    totalSleepMin: secToMin(r.total_sleep_duration) ?? 0,
    deepMin: secToMin(r.deep_sleep_duration),
    remMin: secToMin(r.rem_sleep_duration),
    lightMin: secToMin(r.light_sleep_duration),
    awakeMin: secToMin(r.awake_time),
    latencySec: r.latency,
    efficiency: r.efficiency,
    avgHrBpm: r.average_heart_rate,
    avgHrvMs: r.average_hrv == null ? null : Math.round(r.average_hrv),
    lowestHrBpm: r.lowest_heart_rate,
    source: Source.OURA,
    raw: r as unknown as Prisma.InputJsonValue,
  };
}

export function toDailySleepData(
  r: OuraDailySleepRecord,
): Prisma.DailySleepUncheckedCreateInput {
  return {
    day: dayToDbDate(r.day),
    score: r.score,
    raw: r as unknown as Prisma.InputJsonValue,
  };
}

/**
 * Map daily readiness. NOTE: restingHrBpm and hrvBalance hold Oura's 0–100 contributor
 * *scores* (contributors.resting_heart_rate / hrv_balance), NOT raw bpm / ms — the column
 * names predate the source. The full contributors block is preserved in `raw`.
 */
export function toDailyReadinessData(
  r: OuraDailyReadinessRecord,
): Prisma.DailyReadinessUncheckedCreateInput {
  return {
    day: dayToDbDate(r.day),
    score: r.score,
    temperatureDeviation: r.temperature_deviation,
    restingHrBpm: r.contributors?.resting_heart_rate ?? null,
    hrvBalance: r.contributors?.hrv_balance ?? null,
    raw: r as unknown as Prisma.InputJsonValue,
  };
}

export interface OuraSyncSummary {
  runId: string;
  status: "OK" | "ERROR";
  itemsUpserted: number;
  windowStart: string;
  windowEnd: string;
  rateLimited: boolean;
  error?: string;
}

/**
 * Sync Oura sleep, daily sleep and readiness for the incremental window. Idempotent:
 * every record UPSERTs by external id (sleep) or day (daily summaries), so a re-run over
 * the overlap touches no duplicates, and absence upstream never deletes a local row.
 *
 * Resilient by design — it does not throw for sync-level failures. A 429 stops the run
 * early but closes it OK (partial; the overlap re-covers the gap next run); any other
 * error closes it ERROR. Either way an auditable SyncRun row is written and a structured
 * summary returned, so the MCP agent / route always gets a readable result. Only a
 * failure before the run row exists (missing env, DB down at openSyncRun) propagates.
 */
export async function syncOura(): Promise<OuraSyncSummary> {
  const today = todayLocal();
  const lastOk = await prisma.syncRun.findFirst({
    where: { source: SyncSource.OURA, status: "OK" },
    orderBy: { startedAt: "desc" },
  });
  const window = computeSyncWindow({
    lastOkWindowEnd: lastOk?.windowEnd ?? null,
    today,
    overlapDays: OVERLAP_DAYS,
    backfillDays: backfillDays(),
  });
  const run = await openSyncRun(SyncSource.OURA, window);

  let upserted = 0;
  let rateLimited = false;
  try {
    // Each endpoint fetches its full window, then upserts row-by-row so a 429 raised
    // mid-feed still persists everything written before it. On 429 we stop the whole
    // run (skip the remaining feeds) — the overlap re-covers all of it next time.
    const sleep = await fetchSleep(window.startDate, window.endDate);
    for (const r of sleep) {
      if (r.total_sleep_duration == null) continue; // skip rest/no-sleep periods
      const data = toSleepSessionData(r);
      await prisma.sleepSession.upsert({
        where: { externalId: r.id },
        create: data,
        update: data,
      });
      upserted++;
    }

    const dailySleep = await fetchDailySleep(window.startDate, window.endDate);
    for (const r of dailySleep) {
      const data = toDailySleepData(r);
      await prisma.dailySleep.upsert({
        where: { day: dayToDbDate(r.day) },
        create: data,
        update: data,
      });
      upserted++;
    }

    const readiness = await fetchDailyReadiness(
      window.startDate,
      window.endDate,
    );
    for (const r of readiness) {
      const data = toDailyReadinessData(r);
      await prisma.dailyReadiness.upsert({
        where: { day: dayToDbDate(r.day) },
        create: data,
        update: data,
      });
      upserted++;
    }
  } catch (err) {
    if (!(err instanceof OuraRateLimitError)) {
      const message = err instanceof Error ? err.message : String(err);
      await failSyncRun(run.id, message, upserted);
      return {
        runId: run.id,
        status: "ERROR",
        itemsUpserted: upserted,
        windowStart: window.startDate,
        windowEnd: window.endDate,
        rateLimited: false,
        error: message,
      };
    }
    rateLimited = true;
  }

  await finishSyncRun(
    run.id,
    upserted,
    rateLimited ? "rate limited; partial sync, gap re-covered next run" : undefined,
  );
  return {
    runId: run.id,
    status: "OK",
    itemsUpserted: upserted,
    windowStart: window.startDate,
    windowEnd: window.endDate,
    rateLimited,
  };
}
