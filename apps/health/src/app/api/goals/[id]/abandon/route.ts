import { z } from "zod";

import { jsonError } from "@/lib/api";
import { abandonGoal } from "@/server/services/goals";

export const runtime = "nodejs";

/** Explicitly abandon the goal (the only other status transition). */
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
    return Response.json(await abandonGoal(parsed.data));
  } catch (err) {
    return jsonError(err);
  }
}
