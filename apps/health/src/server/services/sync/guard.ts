// The single guarded entry point for running a sync source. Every trigger —
// scheduler tick, POST /api/sync/*, MCP trigger_sync — goes through
// runGuardedSync so the crash-reap/overlap guard and the OK→ERROR alert can
// never be bypassed by one of the paths. Lives in its own module (not
// sync/index.ts) so importing the registry never drags in notifications.

import type { SyncSource } from "@/generated/prisma/client";
import { alertSyncFailure } from "@/server/services/notifications";
import type { SyncSourceConfig, SyncSummary } from "@/server/services/sync";
import { expireStaleRuns, hasActiveRun } from "@/server/services/sync/runs";

/**
 * A RUNNING run older than this is presumed crashed and reaped; anything younger
 * counts as genuinely in flight. One constant for both cutoffs by construction —
 * two separate knobs previously left a dead zone where a run was neither active
 * nor reapable and a second sync could start alongside it.
 */
export const RUN_TIMEOUT_MS = 30 * 60_000;

export type GuardedSyncResult =
  | { skipped: true; source: SyncSource }
  | ({ skipped: false; source: SyncSource } & SyncSummary);

/**
 * Run one source's sync under the overlap/crash guard: reap stale RUNNING rows
 * (crash recovery), skip if a real run is in flight, then run and alert on an
 * OK→ERROR transition. Sync-level failures come back as a structured ERROR
 * summary (the sync functions never throw for them); only a pre-flight throw
 * (DB down, missing env) propagates to the caller.
 */
export async function runGuardedSync(
  cfg: SyncSourceConfig,
): Promise<GuardedSyncResult> {
  const reaped = await expireStaleRuns(cfg.source, RUN_TIMEOUT_MS);
  if (reaped > 0) {
    console.log(`[sync] ${cfg.source}: reaped ${reaped} stale run(s)`);
  }

  if (await hasActiveRun(cfg.source, RUN_TIMEOUT_MS)) {
    return { skipped: true, source: cfg.source };
  }

  const result = await cfg.run();
  // Alert only when this run flips the feed OK→ERROR (transition, not every fail).
  if (result.status === "ERROR") await alertSyncFailure(cfg.source);
  return { ...result, skipped: false, source: cfg.source };
}
