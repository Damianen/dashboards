import { SyncSource } from "@/generated/prisma/client";
import { jsonError } from "@/lib/api";
import { syncSource } from "@/server/services/sync";

export const runtime = "nodejs";

/**
 * Trigger an Oura sync through the shared guard (same path as a scheduler tick).
 * Sync-level failures come back as HTTP 200 with status "ERROR", matching the MCP
 * tool; { skipped: true } means a run is already in flight. Only a pre-flight
 * failure (missing OURA_CLIENT_* env, DB down before the run opens) reaches
 * jsonError as a 500.
 */
export async function POST() {
  try {
    return Response.json(await syncSource(SyncSource.OURA));
  } catch (err) {
    return jsonError(err);
  }
}
