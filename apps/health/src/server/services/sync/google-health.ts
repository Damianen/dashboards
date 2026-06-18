import { Prisma, Source, SyncSource } from "@/generated/prisma/client";
import { dayToDbDate, todayLocal } from "@/lib/dates";
import { prisma } from "@/server/db";
import {
  type DailyActivityRow,
  fetchDailyActivity,
  GoogleAuthError,
} from "@/server/integrations/google-health";
import {
  computeSyncWindow,
  failSyncRun,
  finishSyncRun,
  openSyncRun,
} from "./runs";

/**
 * The exact error recorded when a sync fails because the refresh token was rejected (the
 * grant was revoked). The connections status service matches this string to flag
 * `needsReauth`, so no separate state is needed — the sync_runs row IS the re-auth marker.
 */
export const GOOGLE_REAUTH_MSG =
  "Google Health needs re-auth: refresh token rejected. Reconnect in Settings.";

// A fresh connection with no prior OK run backfills this many days; incremental runs re-pull
// a 2-day overlap so a civil day that finalised late upstream is never skipped.
const OVERLAP_DAYS = 2;
function backfillDays(): number {
  return Number(process.env.SYNC_BACKFILL_DAYS ?? 90);
}

/**
 * Map a merged daily-activity row to a DailyActivity row. `day` is the civil day the
 * rollup covers — it passes straight through dayToDbDate(). Missing metrics stay null (the
 * columns are nullable); the full per-day payload is preserved in `raw`. Pure.
 */
export function toDailyActivityData(
  row: DailyActivityRow,
): Prisma.DailyActivityUncheckedCreateInput {
  return {
    day: dayToDbDate(row.day),
    activeKcal: row.activeKcal ?? null,
    totalKcal: row.totalKcal ?? null,
    steps: row.steps ?? null,
    source: Source.GOOGLE_HEALTH,
    raw: row.raw as Prisma.InputJsonValue,
  };
}

export interface GoogleHealthSyncSummary {
  runId: string;
  status: "OK" | "ERROR";
  itemsUpserted: number;
  windowStart: string;
  windowEnd: string;
  needsReauth: boolean;
  error?: string;
}

/**
 * Sync Google Health daily activity (energy expenditure + steps rollups) for the
 * incremental window. Idempotent: every day UPSERTs by `day`, so a re-run over the overlap
 * touches no duplicates and absence upstream never deletes a local row.
 *
 * Resilient by design — it never throws for sync-level failures. A rejected refresh token
 * closes the run ERROR with the stable re-auth marker (and returns needsReauth: true); any
 * other error closes it ERROR with its message. Either way an auditable SyncRun row is
 * written and a structured summary returned. Only a failure before the run row exists (DB
 * down at openSyncRun) propagates.
 */
export async function syncGoogleHealth(): Promise<GoogleHealthSyncSummary> {
  const lastOk = await prisma.syncRun.findFirst({
    where: { source: SyncSource.GOOGLE_HEALTH, status: "OK" },
    orderBy: { startedAt: "desc" },
  });
  const window = computeSyncWindow({
    lastOkWindowEnd: lastOk?.windowEnd ?? null,
    today: todayLocal(),
    overlapDays: OVERLAP_DAYS,
    backfillDays: backfillDays(),
  });
  const run = await openSyncRun(SyncSource.GOOGLE_HEALTH, window);

  let upserted = 0;
  try {
    const rows = await fetchDailyActivity(window.startDate, window.endDate);
    for (const row of rows) {
      const data = toDailyActivityData(row);
      await prisma.dailyActivity.upsert({
        where: { day: dayToDbDate(row.day) },
        create: data,
        update: data,
      });
      upserted++;
    }
  } catch (err) {
    const needsReauth = err instanceof GoogleAuthError;
    const message = needsReauth
      ? GOOGLE_REAUTH_MSG
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
      needsReauth,
      error: message,
    };
  }

  await finishSyncRun(run.id, upserted);
  return {
    runId: run.id,
    status: "OK",
    itemsUpserted: upserted,
    windowStart: window.startDate,
    windowEnd: window.endDate,
    needsReauth: false,
  };
}
