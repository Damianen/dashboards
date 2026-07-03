import { jsonError } from "@/lib/api";
import { weeklyReviewQuerySchema } from "@/lib/schemas/insights";
import { getWeeklyReview } from "@/server/services/weekly-review";

export const runtime = "nodejs";

// Read-only: the Monday-start weekly review — this week vs last, per-domain
// aggregates, null-safe deltas and single-day callouts. Any ?weekStart day
// normalizes to its week's Monday; omitted = the current (partial) week.
export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams;
    const parsed = weeklyReviewQuerySchema.safeParse({
      weekStart: sp.get("weekStart") ?? undefined,
    });
    if (!parsed.success) {
      return Response.json(parsed.error.flatten(), { status: 400 });
    }
    return Response.json(await getWeeklyReview(parsed.data.weekStart));
  } catch (err) {
    return jsonError(err);
  }
}
