import { jsonError } from "@/lib/api";
import { syncGoogleHealth } from "@/server/services/sync/google-health";

export const runtime = "nodejs";

/**
 * Trigger a Google Health sync. syncGoogleHealth captures sync-level failures into its
 * summary (HTTP 200 with status "ERROR", incl. needsReauth), matching the MCP tool; only a
 * pre-flight failure (DB down before the run opens) reaches jsonError as a 500.
 */
export async function POST() {
  try {
    return Response.json(await syncGoogleHealth());
  } catch (err) {
    return jsonError(err);
  }
}
