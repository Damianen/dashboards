import { jsonError } from "@/lib/api";
import { syncWithings } from "@/server/services/sync/withings";

export const runtime = "nodejs";

/**
 * Trigger a Withings sync. syncWithings captures sync-level failures into its summary
 * (HTTP 200 with status "ERROR", incl. needsReauth), matching the MCP tool; only a
 * pre-flight failure (DB down before the run opens) reaches jsonError as a 500.
 */
export async function POST() {
  try {
    return Response.json(await syncWithings());
  } catch (err) {
    return jsonError(err);
  }
}
