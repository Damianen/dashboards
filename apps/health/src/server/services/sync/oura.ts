import { Prisma, Source, SyncSource } from "@/generated/prisma/client";
import { dayToDbDate, todayLocal } from "@/lib/dates";
import { prisma } from "@/server/db";
import {
  fetchDailyActivity,
  fetchDailyReadiness,
  fetchDailySleep,
  fetchSleep,
  OuraAuthError,
  type OuraDailyActivityRecord,
  type OuraDailyReadinessRecord,
  type OuraDailySleepRecord,
  type OuraSleepRecord,
  OuraRateLimitError,
} from "@/server/integrations/oura";
import { ReauthRequiredError } from "@/server/services/tokens";
import {
  computeSyncWindow,
  failSyncRun,
  finishSyncRun,
  openSyncRun,
} from "./runs";

/**
 * The exact error recorded when a sync fails because Oura is unlinked or its (rotated)
 * refresh token was rejected. The connections status service matches this string to flag
 * `needsReauth`, so no separate state is needed — the sync_runs row IS the re-auth marker.
 */
export const OURA_REAUTH_MSG =
  "Oura needs re-auth: refresh token rejected. Reconnect in Settings.";

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

/**
 * Map daily activity. activeKcal / totalKcal are Oura's wrist-EE estimates — stored as a
 * relative TREND signal only (per the health guardrails), never a measured truth and never
 * netted against intake. Oura's `day` passes straight through dayToDbDate(). The full record
 * (incl. contributors) is preserved in `raw`.
 */
export function toDailyActivityData(
  r: OuraDailyActivityRecord,
): Prisma.DailyActivityUncheckedCreateInput {
  return {
    day: dayToDbDate(r.day),
    activeKcal: r.active_calories,
    totalKcal: r.total_calories,
    steps: r.steps,
    source: Source.OURA,
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
  needsReauth: boolean;
  error?: string;
}

/**
 * How a rate-limited run must close. A steady-state 429 closes OK — the run's
 * windowEnd advances the watermark and the fixed overlap re-covers the small gap
 * next run. During the initial backfill that logic is a data-loss bug: the
 * watermark would jump to today while months of unfetched history fall outside
 * the overlap and would never be requested again. So a backfill 429 closes
 * ERROR, keeping the watermark unset so the next run retries the full window.
 */
export function rateLimitedClose(isBackfill: boolean): {
  status: "OK" | "ERROR";
  note: string;
} {
  return isBackfill
    ? {
        status: "ERROR",
        note: "rate limited during initial backfill; the full window is retried next run",
      }
    : {
        status: "OK",
        note: "rate limited; partial sync, gap re-covered next run",
      };
}

/**
 * Sync Oura sleep, daily sleep and readiness for the incremental window. Idempotent:
 * every record UPSERTs by external id (sleep) or day (daily summaries), so a re-run over
 * the overlap touches no duplicates, and absence upstream never deletes a local row.
 *
 * Resilient by design — it does not throw for sync-level failures. A 429 stops the run
 * early and closes it per rateLimitedClose (OK on an incremental run, ERROR during the
 * initial backfill so the watermark never advances past unfetched history). An unlinked
 * Oura, a rejected refresh token (OuraAuthError), or an undecryptable stored token
 * (ReauthRequiredError) closes the run ERROR with the stable re-auth marker and returns
 * needsReauth: true; any other error closes it ERROR with its message. Either way an
 * auditable SyncRun row is written and a structured summary returned, so the MCP agent /
 * route always gets a readable result. Only a failure before the run row exists (missing
 * env, DB down at openSyncRun) propagates.
 */
export async function syncOura(): Promise<OuraSyncSummary> {
  const today = todayLocal();
  const lastOk = await prisma.syncRun.findFirst({
    where: { source: SyncSource.OURA, status: "OK" },
    orderBy: { startedAt: "desc" },
  });
  const isBackfill = lastOk == null;
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

    const activity = await fetchDailyActivity(
      window.startDate,
      window.endDate,
    );
    for (const r of activity) {
      const data = toDailyActivityData(r);
      await prisma.dailyActivity.upsert({
        where: { day: dayToDbDate(r.day) },
        create: data,
        update: data,
      });
      upserted++;
    }
  } catch (err) {
    if (err instanceof OuraRateLimitError) {
      rateLimited = true;
    } else {
      const needsReauth =
        err instanceof OuraAuthError || err instanceof ReauthRequiredError;
      const message = needsReauth
        ? OURA_REAUTH_MSG
        : err instanceof Error
          ? err.message
          : String(err);
      await failSyncRun(run.id, message, upserted);
      return {
        runId: run.id,
        status: "ERROR",
        itemsUpserted: upserted,
        windowStart: window.startDate,
        windowEnd: window.endDate,
        rateLimited: false,
        needsReauth,
        error: message,
      };
    }
  }

  if (rateLimited) {
    const close = rateLimitedClose(isBackfill);
    if (close.status === "ERROR") {
      await failSyncRun(run.id, close.note, upserted);
      return {
        runId: run.id,
        status: "ERROR",
        itemsUpserted: upserted,
        windowStart: window.startDate,
        windowEnd: window.endDate,
        rateLimited: true,
        needsReauth: false,
        error: close.note,
      };
    }
    await finishSyncRun(run.id, upserted, close.note);
    return {
      runId: run.id,
      status: "OK",
      itemsUpserted: upserted,
      windowStart: window.startDate,
      windowEnd: window.endDate,
      rateLimited: true,
      needsReauth: false,
    };
  }

  await finishSyncRun(run.id, upserted);
  return {
    runId: run.id,
    status: "OK",
    itemsUpserted: upserted,
    windowStart: window.startDate,
    windowEnd: window.endDate,
    rateLimited: false,
    needsReauth: false,
  };
}
