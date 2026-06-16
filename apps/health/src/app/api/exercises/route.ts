import { jsonError } from "@/lib/api";
import { listExercises } from "@/server/services/lifting";

export const runtime = "nodejs";

export async function GET() {
  try {
    return Response.json(await listExercises());
  } catch (err) {
    return jsonError(err);
  }
}
