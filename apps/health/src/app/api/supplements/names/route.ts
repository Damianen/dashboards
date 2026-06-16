import { jsonError } from "@/lib/api";
import { listRecentNames } from "@/server/services/supplements";

export const runtime = "nodejs";

export async function GET() {
  try {
    return Response.json(await listRecentNames());
  } catch (err) {
    return jsonError(err);
  }
}
