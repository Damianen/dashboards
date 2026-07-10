import { jsonError } from "@/lib/api";
import { previewGoalSchema } from "@/lib/schemas/goals";
import { previewGoal } from "@/server/services/goals";

export const runtime = "nodejs";

/** Live plan preview for the create form — pure computation, persists nothing.
 *  Body: { goalWeightKg, targetDate }. */
export async function POST(req: Request) {
  try {
    const parsed = previewGoalSchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json(parsed.error.flatten(), { status: 400 });
    }
    return Response.json(await previewGoal(parsed.data));
  } catch (err) {
    return jsonError(err);
  }
}
