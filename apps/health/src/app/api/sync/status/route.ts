import { jsonError } from "@/lib/api";
import { getSyncStatus } from "@/server/services/sync";

export const runtime = "nodejs";

export async function GET() {
  try {
    return Response.json(await getSyncStatus());
  } catch (err) {
    return jsonError(err);
  }
}
