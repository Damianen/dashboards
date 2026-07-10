import { jsonError } from "@/lib/api";
import { createGoalSchema } from "@/lib/schemas/goals";
import { createGoal, getGoalStatus } from "@/server/services/goals";

export const runtime = "nodejs";

/** Goal status: the ACTIVE goal (with trend/progress/paused state), the last
 *  finished goal, and the check-in history. */
export async function GET() {
  try {
    return Response.json(await getGoalStatus());
  } catch (err) {
    return jsonError(err);
  }
}

/** Create the (single) active goal. Body: { goalWeightKg, targetDate }.
 *  Returns { goal, plan } — the plan carries any clamp warning. */
export async function POST(req: Request) {
  try {
    const parsed = createGoalSchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json(parsed.error.flatten(), { status: 400 });
    }
    return Response.json(await createGoal(parsed.data));
  } catch (err) {
    return jsonError(err);
  }
}
