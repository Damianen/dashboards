import { SyncSource } from "@/generated/prisma/client";
import { dayOf, shiftDay } from "@/lib/dates";
import { prisma } from "@/server/db";
import {
  getMeasurements,
  groupMeasures,
  type WithingsMeasureWindow,
  WithingsAuthError,
} from "@/server/integrations/withings";
import { ReauthRequiredError } from "@/server/services/tokens";
import {
  failSyncRun,
  finishSyncRun,
  openSyncRun,
  type SyncWindow,
} from "./runs";

/**
 * The exact error recorded when a sync fails because the (single-use) refresh token was
 * rejected. The connections status service matches this string to flag `needsReauth`, so
 * no separate state is needed — the sync_runs row IS the re-auth marker.
 */
export const WITHINGS_REAUTH_MSG =
  "Withings needs re-auth: refresh token rejected. Reconnect in Settings.";

// Incremental pulls re-cover this much wall-clock before the last OK run started, so a
// measurement that landed late upstream isn't missed.
const OVERLAP_MS = 60 * 60 * 1000;
function backfillDays(): number {
  return Number(process.env.SYNC_BACKFILL_DAYS ?? 90);
}

/** A getmeas query plus the civil-day window to stamp on the SyncRun audit row. */
export interface WithingsPlan {
  query: WithingsMeasureWindow;
  window: SyncWindow;
}

/**
 * Decide what to fetch. Withings supports a `lastupdate` watermark (epoch seconds) that
 * returns every group touched since then — far better than date windows for catching
 * back-dated edits — so incremental runs use `last OK run's startedAt − overlap`. With no
 * prior OK run we backfill an absolute startdate/enddate window. Pure (watermark, now and
 * the knobs are all passed in). A future-dated watermark (clock skew) is clamped to now so
 * `lastupdate` never points past the present.
 */
export function withingsQuery(args: {
  lastOkStartedAt: Date | null;
  now: Date;
  overlapMs: number;
  backfillDays: number;
}): WithingsPlan {
  const { lastOkStartedAt, now, overlapMs, backfillDays } = args;
  const today = dayOf(now);
  if (lastOkStartedAt) {
    const sinceMs = Math.min(lastOkStartedAt.getTime() - overlapMs, now.getTime());
    return {
      query: { lastupdate: Math.floor(sinceMs / 1000) },
      window: { startDate: dayOf(new Date(sinceMs)), endDate: today },
    };
  }
  const startDay = shiftDay(today, -backfillDays);
  return {
    query: {
      startdate: Math.floor(
        new Date(`${startDay}T00:00:00.000Z`).getTime() / 1000,
      ),
      enddate: Math.floor(now.getTime() / 1000),
    },
    window: { startDate: startDay, endDate: today },
  };
}

export interface WithingsSyncSummary {
  runId: string;
  status: "OK" | "ERROR";
  itemsUpserted: number;
  windowStart: string;
  windowEnd: string;
  needsReauth: boolean;
  error?: string;
}

/**
 * Sync Withings body measurements for the incremental window. Idempotent: every group
 * UPSERTs by grpid (externalId), so a re-run over the overlap touches no duplicates and
 * absence upstream never deletes a local row.
 *
 * Resilient by design — it never throws for sync-level failures. A rejected refresh token
 * closes the run ERROR with the stable re-auth marker (and returns needsReauth: true);
 * any other error closes it ERROR with its message. Either way an auditable SyncRun row is
 * written and a structured summary returned. Only a failure before the run row exists
 * (DB down at openSyncRun) propagates.
 */
export async function syncWithings(): Promise<WithingsSyncSummary> {
  const lastOk = await prisma.syncRun.findFirst({
    where: { source: SyncSource.WITHINGS, status: "OK" },
    orderBy: { startedAt: "desc" },
  });
  const plan = withingsQuery({
    lastOkStartedAt: lastOk?.startedAt ?? null,
    now: new Date(),
    overlapMs: OVERLAP_MS,
    backfillDays: backfillDays(),
  });
  const run = await openSyncRun(SyncSource.WITHINGS, plan.window);

  let upserted = 0;
  try {
    const groups = await getMeasurements(plan.query);
    for (const data of groupMeasures(groups)) {
      await prisma.weightMeasurement.upsert({
        where: { externalId: data.externalId },
        create: data,
        update: data,
      });
      upserted++;
    }
  } catch (err) {
    const needsReauth =
      err instanceof WithingsAuthError || err instanceof ReauthRequiredError;
    const message = needsReauth
      ? WITHINGS_REAUTH_MSG
      : err instanceof Error
        ? err.message
        : String(err);
    await failSyncRun(run.id, message, upserted);
    return {
      runId: run.id,
      status: "ERROR",
      itemsUpserted: upserted,
      windowStart: plan.window.startDate,
      windowEnd: plan.window.endDate,
      needsReauth,
      error: message,
    };
  }

  await finishSyncRun(run.id, upserted);
  return {
    runId: run.id,
    status: "OK",
    itemsUpserted: upserted,
    windowStart: plan.window.startDate,
    windowEnd: plan.window.endDate,
    needsReauth: false,
  };
}
