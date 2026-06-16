import { jsonError } from "@/lib/api";
import { syncAll } from "@/server/services/sync";

export const runtime = "nodejs";

export async function POST() {
  try {
    return Response.json(await syncAll());
  } catch (err) {
    return jsonError(err);
  }
}
