import { jsonError } from "@/lib/api";
import { getConnections } from "@/server/services/connections";

export const runtime = "nodejs";

/** Per-provider connection + last-sync status for the Settings page. */
export async function GET() {
  try {
    return Response.json(await getConnections());
  } catch (err) {
    return jsonError(err);
  }
}
