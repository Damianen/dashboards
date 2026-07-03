// Admin tools: wearable sync status and the manual sync trigger.

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { NotFoundError } from "@/server/services/errors";
import {
  getSyncStatus,
  SYNC_SOURCES,
  syncSource,
} from "@/server/services/sync";

import { run } from "./shared";

export function registerAdminTools(server: McpServer): void {
  server.registerTool(
    "get_sync_status",
    {
      description:
        "Per-source sync status (Oura, Withings): the configured cadence and the most " +
        "recent run ({ status, startedAt, finishedAt, itemsUpserted, error }). lastRun " +
        "is null for a source that has never synced.",
      inputSchema: {},
    },
    () => run(() => getSyncStatus()),
  );

  server.registerTool(
    "trigger_sync",
    {
      description:
        "Trigger a wearable sync for a source since the last successful run (idempotent " +
        "UPSERT by external id / day), returning a run summary { status, itemsUpserted, " +
        "window }. Runs under the same guard as the scheduler: { skipped: true } means a " +
        "sync for that source is already in flight — retry in a few minutes. Oura pulls " +
        "sleep, daily sleep and readiness; Withings pulls body measurements (weight + " +
        "composition). An unlinked provider or a rejected refresh token returns " +
        "needsReauth: true rather than erroring out.",
      inputSchema: {
        source: z
          .enum(
            SYNC_SOURCES.map((c) => c.source.toLowerCase()) as [
              string,
              ...string[],
            ],
          )
          .describe("Which source to sync."),
      },
    },
    ({ source }) =>
      run(() => {
        const cfg = SYNC_SOURCES.find(
          (c) => c.source.toLowerCase() === source,
        );
        if (!cfg) throw new NotFoundError("sync source", source);
        return syncSource(cfg.source);
      }),
  );
}
