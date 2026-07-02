import { z } from "zod";

import { jsonError } from "@/lib/api";
import { archiveDailyPlanSchema } from "@/lib/schemas/daily-plans";
import { setDailyPlanArchived } from "@/server/services/dailyPlans";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const idParsed = z.cuid().safeParse(id);
    if (!idParsed.success) {
      return Response.json(idParsed.error.flatten(), { status: 400 });
    }
    // A bare POST archives; { archived: false } restores. Tolerate an empty body.
    const body = await req.json().catch(() => ({}));
    const parsed = archiveDailyPlanSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(parsed.error.flatten(), { status: 400 });
    }
    return Response.json(
      await setDailyPlanArchived(idParsed.data, parsed.data.archived),
    );
  } catch (err) {
    return jsonError(err);
  }
}
