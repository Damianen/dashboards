import { beforeEach, describe, expect, it, vi } from "vitest";

import { SyncSource } from "@/generated/prisma/client";
import { runGuardedSync, RUN_TIMEOUT_MS } from "./guard";
import type { SyncSourceConfig, SyncSummary } from "./index";

const expireStaleRuns = vi.fn<(...args: unknown[]) => Promise<number>>();
const hasActiveRun = vi.fn<(...args: unknown[]) => Promise<boolean>>();
const alertSyncFailure = vi.fn<(...args: unknown[]) => Promise<void>>();

vi.mock("@/server/services/sync/runs", () => ({
  expireStaleRuns: (...args: unknown[]) => expireStaleRuns(...args),
  hasActiveRun: (...args: unknown[]) => hasActiveRun(...args),
}));
vi.mock("@/server/services/notifications", () => ({
  alertSyncFailure: (...args: unknown[]) => alertSyncFailure(...args),
}));

function cfg(run: () => Promise<SyncSummary>): SyncSourceConfig {
  return { source: SyncSource.OURA, cron: "* * * * *", cadence: "test", run };
}

beforeEach(() => {
  vi.clearAllMocks();
  expireStaleRuns.mockResolvedValue(0);
  hasActiveRun.mockResolvedValue(false);
  alertSyncFailure.mockResolvedValue(undefined);
});

describe("runGuardedSync", () => {
  it("reaps stale runs before the active check, both with the same timeout", async () => {
    const order: string[] = [];
    expireStaleRuns.mockImplementation(async () => {
      order.push("reap");
      return 0;
    });
    hasActiveRun.mockImplementation(async () => {
      order.push("check");
      return false;
    });

    await runGuardedSync(cfg(async () => ({ status: "OK", itemsUpserted: 1 })));

    expect(order).toEqual(["reap", "check"]);
    expect(expireStaleRuns).toHaveBeenCalledWith(SyncSource.OURA, RUN_TIMEOUT_MS);
    expect(hasActiveRun).toHaveBeenCalledWith(SyncSource.OURA, RUN_TIMEOUT_MS);
  });

  it("skips without running when a run is already in flight", async () => {
    hasActiveRun.mockResolvedValue(true);
    const run = vi.fn(async (): Promise<SyncSummary> => ({
      status: "OK",
      itemsUpserted: 3,
    }));

    const result = await runGuardedSync(cfg(run));

    expect(result).toEqual({ skipped: true, source: SyncSource.OURA });
    expect(run).not.toHaveBeenCalled();
    expect(alertSyncFailure).not.toHaveBeenCalled();
  });

  it("passes the summary through (with skipped: false) and never alerts on OK", async () => {
    const result = await runGuardedSync(
      cfg(async () => ({ status: "OK", itemsUpserted: 7 })),
    );

    expect(result).toEqual({
      skipped: false,
      source: SyncSource.OURA,
      status: "OK",
      itemsUpserted: 7,
    });
    expect(alertSyncFailure).not.toHaveBeenCalled();
  });

  it("alerts on a structured ERROR summary — every trigger path, not just cron", async () => {
    const result = await runGuardedSync(
      cfg(async () => ({ status: "ERROR", itemsUpserted: 0, error: "boom" })),
    );

    expect(result).toMatchObject({ status: "ERROR", error: "boom" });
    expect(alertSyncFailure).toHaveBeenCalledWith(SyncSource.OURA);
  });

  it("propagates a pre-flight throw without alerting (no run row was written)", async () => {
    await expect(
      runGuardedSync(
        cfg(async () => {
          throw new Error("db down");
        }),
      ),
    ).rejects.toThrow("db down");
    expect(alertSyncFailure).not.toHaveBeenCalled();
  });
});
