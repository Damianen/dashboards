import { describe, expect, it } from "vitest";

import { SyncSource } from "@/generated/prisma/client";
import {
  runSyncSequential,
  type SyncSourceConfig,
  type SyncSummary,
} from "./index";

function cfg(
  source: SyncSource,
  run: () => Promise<SyncSummary>,
): SyncSourceConfig {
  return { source, cron: "* * * * *", cadence: "test", run };
}

describe("runSyncSequential", () => {
  it("runs sources in order and passes through each summary", async () => {
    const calls: SyncSource[] = [];
    const results = await runSyncSequential([
      cfg(SyncSource.OURA, async () => {
        calls.push(SyncSource.OURA);
        return { status: "OK", itemsUpserted: 3 };
      }),
      cfg(SyncSource.WITHINGS, async () => {
        calls.push(SyncSource.WITHINGS);
        return { status: "ERROR", itemsUpserted: 1, error: "boom" };
      }),
    ]);

    expect(calls).toEqual([SyncSource.OURA, SyncSource.WITHINGS]);
    expect(results).toEqual([
      { source: SyncSource.OURA, status: "OK", itemsUpserted: 3, error: undefined },
      { source: SyncSource.WITHINGS, status: "ERROR", itemsUpserted: 1, error: "boom" },
    ]);
  });

  it("continues past a thrown error, recording it as an ERROR result", async () => {
    const ran: SyncSource[] = [];
    const results = await runSyncSequential([
      cfg(SyncSource.OURA, async () => {
        ran.push(SyncSource.OURA);
        throw new Error("pre-flight failure");
      }),
      cfg(SyncSource.GOOGLE_HEALTH, async () => {
        ran.push(SyncSource.GOOGLE_HEALTH);
        return { status: "OK", itemsUpserted: 5 };
      }),
    ]);

    // The throwing source did not abort the run — the next source still executed.
    expect(ran).toEqual([SyncSource.OURA, SyncSource.GOOGLE_HEALTH]);
    expect(results[0]).toEqual({
      source: SyncSource.OURA,
      status: "ERROR",
      itemsUpserted: 0,
      error: "pre-flight failure",
    });
    expect(results[1]).toMatchObject({
      source: SyncSource.GOOGLE_HEALTH,
      status: "OK",
      itemsUpserted: 5,
    });
  });

  it("returns an empty array for no sources", async () => {
    expect(await runSyncSequential([])).toEqual([]);
  });
});
