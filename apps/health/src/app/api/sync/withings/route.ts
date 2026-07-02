import { SyncSource } from "@/generated/prisma/client";
import { jsonError } from "@/lib/api";
import { syncSource } from "@/server/services/sync";

export const runtime = "nodejs";

/**
 * Trigger a Withings sync through the shared guard (same path as a scheduler tick).
 * Sync-level failures come back as HTTP 200 with status "ERROR" (incl. needsReauth),
 * matching the MCP tool; { skipped: true } means a run is already in flight. Only a
 * pre-flight failure (DB down before the run opens) reaches jsonError as a 500.
 */
export async function POST() {
  try {
    return Response.json(await syncSource(SyncSource.WITHINGS));
  } catch (err) {
    return jsonError(err);
  }
}
