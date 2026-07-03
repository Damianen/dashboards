import { jsonError } from "@/lib/api";
import { todayLocal } from "@/lib/dates";
import { briefingModeSchema } from "@/lib/schemas/briefing";
import { daySchema } from "@/lib/schemas/common";
import { getBriefing } from "@/server/services/briefing";

export const runtime = "nodejs";

/**
 * The composed daily briefing. `?mode=morning|evening` (defaults by Amsterdam
 * time against the configured cutoff), `?day=YYYY-MM-DD` (defaults to today).
 */
export async function GET(req: Request) {
  try {
    const params = new URL(req.url).searchParams;
    const mode = briefingModeSchema
      .optional()
      .safeParse(params.get("mode") ?? undefined);
    if (!mode.success) {
      return Response.json(mode.error.flatten(), { status: 400 });
    }
    const day = daySchema.safeParse(params.get("day") ?? todayLocal());
    if (!day.success) {
      return Response.json(day.error.flatten(), { status: 400 });
    }
    return Response.json(await getBriefing(mode.data, day.data));
  } catch (err) {
    return jsonError(err);
  }
}
