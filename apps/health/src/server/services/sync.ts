import { type SyncRun, SyncSource } from "@/generated/prisma/client";
import { prisma } from "@/server/db";

/**
 * The most recent sync run per source. Empty until a sync phase (Oura, Withings,
 * Google Health) lands and writes its first run. The local DB is the source of
 * truth — this only reports the latest attempt per feed.
 */
export async function getSyncStatus(): Promise<SyncRun[]> {
  const runs = await Promise.all(
    Object.values(SyncSource).map((source) =>
      prisma.syncRun.findFirst({
        where: { source },
        orderBy: { startedAt: "desc" },
      }),
    ),
  );
  return runs.filter((r): r is SyncRun => r !== null);
}
