import {
  type SyncSource as SyncSourceType,
  SyncSource,
  type SyncStatus,
} from "@/generated/prisma/client";
import { syncGoogleHealth } from "@/server/services/sync/google-health";
import { syncOura } from "@/server/services/sync/oura";
import { latestRunsBySource } from "@/server/services/sync/runs";
import { syncWithings } from "@/server/services/sync/withings";

/** The fields every per-source sync summary shares — all `runSyncSequential` reads. */
export interface SyncSummary {
  status: "OK" | "ERROR";
  itemsUpserted: number;
  error?: string;
}

/**
 * One sync source's wiring, used by BOTH the scheduler (cron) and the orchestration
 * helpers below — the single source of truth so the configured cadence shown in the UI
 * can never drift from the schedule that actually runs.
 */
export interface SyncSourceConfig {
  source: SyncSourceType;
  /** croner pattern (Europe/Amsterdam) the scheduler registers. */
  cron: string;
  /** Human-readable cadence for the Settings UI. */
  cadence: string;
  run: () => Promise<SyncSummary>;
}

export const SYNC_SOURCES: SyncSourceConfig[] = [
  {
    source: SyncSource.OURA,
    cron: "10 */2 * * *",
    cadence: "Every 2 hours",
    run: syncOura,
  },
  {
    source: SyncSource.WITHINGS,
    cron: "20 */6 * * *",
    cadence: "Every 6 hours",
    run: syncWithings,
  },
  {
    source: SyncSource.GOOGLE_HEALTH,
    cron: "30 */6 * * *",
    cadence: "Every 6 hours",
    run: syncGoogleHealth,
  },
];

export interface SyncAllResult {
  source: SyncSourceType;
  status: "OK" | "ERROR";
  itemsUpserted: number;
  error?: string;
}

/**
 * Run the given sources one after another, never aborting on a per-source failure: a
 * source whose sync throws is recorded as ERROR and the next source still runs. (The
 * sync functions normally fold errors into their summary; this catch covers the rare
 * pre-flight throw, e.g. the DB being unreachable.) Pure given its `sources` argument
 * — the registry is injected so the sequencing is unit-testable without a database.
 */
export async function runSyncSequential(
  sources: SyncSourceConfig[],
): Promise<SyncAllResult[]> {
  const results: SyncAllResult[] = [];
  for (const cfg of sources) {
    try {
      const r = await cfg.run();
      results.push({
        source: cfg.source,
        status: r.status,
        itemsUpserted: r.itemsUpserted,
        error: r.error,
      });
    } catch (err) {
      results.push({
        source: cfg.source,
        status: "ERROR",
        itemsUpserted: 0,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return results;
}

/** Sync every configured source sequentially (manual "Sync all" trigger). */
export function syncAll(): Promise<SyncAllResult[]> {
  return runSyncSequential(SYNC_SOURCES);
}

export interface SyncStatusLastRun {
  status: SyncStatus;
  startedAt: Date;
  finishedAt: Date | null;
  itemsUpserted: number;
  error: string | null;
}

export interface SyncStatusEntry {
  source: SyncSourceType;
  cadence: string;
  lastRun: SyncStatusLastRun | null;
}

/**
 * Per-source sync status for the Settings card: the latest run (if any) plus the
 * configured cadence. Every source in the registry appears, even one that has never
 * run (`lastRun: null`), so the UI can render a stable row per source.
 */
export async function getSyncStatus(): Promise<SyncStatusEntry[]> {
  const runs = await latestRunsBySource();
  const bySource = new Map(runs.map((r) => [r.source, r]));
  return SYNC_SOURCES.map((cfg) => {
    const run = bySource.get(cfg.source);
    return {
      source: cfg.source,
      cadence: cfg.cadence,
      lastRun: run
        ? {
            status: run.status,
            startedAt: run.startedAt,
            finishedAt: run.finishedAt,
            itemsUpserted: run.itemsUpserted,
            error: run.error,
          }
        : null,
    };
  });
}
