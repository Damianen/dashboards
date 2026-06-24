import { Cron } from "croner";

import {
  alertSyncFailure,
  observationDigest,
  recoveryHeadsUp,
  streakMilestones,
  waterNudge,
  weeklySummary,
} from "@/server/services/notifications";
import {
  type SyncSourceConfig,
  SYNC_SOURCES,
} from "@/server/services/sync";
import { expireStaleRuns, hasActiveRun } from "@/server/services/sync/runs";

const TIMEZONE = "Europe/Amsterdam";
/** A RUNNING run older than this is presumed crashed and reaped before each tick. */
const STALE_MS = 60 * 60_000;
/** A RUNNING run younger than this means a sync is genuinely in flight — skip. */
const ACTIVE_MS = 30 * 60_000;

/**
 * Run one source's sync under the overlap/crash guard. Never throws: a guarded job that
 * blew up out of croner would take the whole scheduler down, so every path is caught and
 * logged. The guard first reaps stale RUNNING rows (crash recovery), then skips if a real
 * run is still in flight.
 */
async function guarded(cfg: SyncSourceConfig): Promise<void> {
  const tag = `[scheduler] ${cfg.source}`;
  try {
    const reaped = await expireStaleRuns(cfg.source, STALE_MS);
    if (reaped > 0) console.log(`${tag}: reaped ${reaped} stale run(s)`);

    if (await hasActiveRun(cfg.source, ACTIVE_MS)) {
      console.log(`${tag}: skipped — a run is already in progress`);
      return;
    }

    console.log(`${tag}: sync started`);
    const result = await cfg.run();
    console.log(
      `${tag}: sync finished — ${result.status}, ${result.itemsUpserted} item(s)`,
    );
    // Alert only when this run flips the feed OK→ERROR (transition, not every fail).
    if (result.status === "ERROR") await alertSyncFailure(cfg.source);
  } catch (err) {
    console.error(`${tag}: sync crashed`, err);
  }
}

/** Run a notification job, swallowing errors so a throw can't take the scheduler down. */
async function runNotificationJob(
  name: string,
  fn: () => Promise<void>,
): Promise<void> {
  try {
    await fn();
  } catch (err) {
    console.error(`[scheduler] ${name} failed`, err);
  }
}

// Survive dev hot-reloads / repeated register() calls: start the cron jobs exactly once.
const globalForScheduler = globalThis as unknown as { schedulerStarted?: boolean };

/** Register the croner jobs (idempotent). Called from instrumentation when enabled. */
export function startScheduler(): void {
  if (globalForScheduler.schedulerStarted) return;
  globalForScheduler.schedulerStarted = true;

  for (const cfg of SYNC_SOURCES) {
    new Cron(cfg.cron, { timezone: TIMEZONE, name: cfg.source }, () =>
      guarded(cfg),
    );
  }

  // 20:00 daily — nudge if today's water is still under target.
  new Cron("0 20 * * *", { timezone: TIMEZONE, name: "water-nudge" }, () =>
    runNotificationJob("water-nudge", waterNudge),
  );
  // 18:00 Sundays — the weekly summary.
  new Cron("0 18 * * 0", { timezone: TIMEZONE, name: "weekly-summary" }, () =>
    runNotificationJob("weekly-summary", weeklySummary),
  );
  // 19:00 daily — the observation digest (after the day's Oura/lifting data has landed).
  new Cron("0 19 * * *", { timezone: TIMEZONE, name: "observations" }, () =>
    runNotificationJob("observations", observationDigest),
  );
  // 09:00 daily — celebrate any streak that has hit a milestone (gentle, fires once per run).
  new Cron("0 9 * * *", { timezone: TIMEZONE, name: "streak-milestones" }, () =>
    runNotificationJob("streak-milestones", streakMilestones),
  );
  // 11:00 daily — under-recovery heads-up (after the 10:10 Oura sync lands last night's data).
  new Cron("0 11 * * *", { timezone: TIMEZONE, name: "recovery-headsup" }, () =>
    runNotificationJob("recovery-headsup", recoveryHeadsUp),
  );

  console.log(
    `[scheduler] started ${SYNC_SOURCES.length + 5} job(s) (${TIMEZONE})`,
  );
}
