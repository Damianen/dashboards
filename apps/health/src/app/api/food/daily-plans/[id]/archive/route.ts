import { z } from "zod";

import { jsonError } from "@/lib/api";
import { archiveDailyPlan } from "@/server/services/dailyPlans";

export const runtime = "nodejs";

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
    return Response.json(await archiveDailyPlan(parsed.data));
  } catch (err) {
    return jsonError(err);
  }
}
