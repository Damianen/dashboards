import { z } from "zod";

import { jsonError } from "@/lib/api";
import { completeGoal } from "@/server/services/goals";

export const runtime = "nodejs";

/** Explicitly complete the goal (never automatic — reaching the goal only
 *  surfaces a suggestion). */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const parsed = z.cuid().safeParse(id);
    if (!parsed.success) {
      return Response.json(parsed.error.flatten(), { status: 400 });
    }
    return Response.json(await completeGoal(parsed.data));
  } catch (err) {
    return jsonError(err);
  }
}
