import { z } from "zod";

import { jsonError } from "@/lib/api";
import { decideCheckInSchema } from "@/lib/schemas/goals";
import { decideCheckIn } from "@/server/services/goals";

export const runtime = "nodejs";

/** One-tap decision on a PROPOSED weekly check-in. Body: { decision }. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const parsedId = z.cuid().safeParse(id);
    if (!parsedId.success) {
      return Response.json(parsedId.error.flatten(), { status: 400 });
    }
    const parsed = decideCheckInSchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json(parsed.error.flatten(), { status: 400 });
    }
    return Response.json(
      await decideCheckIn(parsedId.data, parsed.data.decision, "PWA"),
    );
  } catch (err) {
    return jsonError(err);
  }
}
