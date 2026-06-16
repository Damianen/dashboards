import { jsonError } from "@/lib/api";
import { syncOura } from "@/server/services/sync/oura";

export const runtime = "nodejs";

/**
 * Trigger an Oura sync. syncOura captures sync-level failures into its summary (HTTP 200
 * with status "ERROR"), matching the MCP tool; only a pre-flight failure (missing OURA_PAT,
 * DB down before the run opens) reaches jsonError as a 500.
 */
export async function POST() {
  try {
    return Response.json(await syncOura());
  } catch (err) {
    return jsonError(err);
  }
}
