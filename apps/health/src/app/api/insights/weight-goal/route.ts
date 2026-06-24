import { jsonError } from "@/lib/api";
import { getWeightGoal } from "@/server/services/weight-goal";

export const runtime = "nodejs";

/** Body-weight goal status: goal, current weight, trend, and projected ETA. */
export async function GET() {
  try {
    return Response.json(await getWeightGoal());
  } catch (err) {
    return jsonError(err);
  }
}
