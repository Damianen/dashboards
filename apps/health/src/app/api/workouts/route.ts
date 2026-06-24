import { jsonError } from "@/lib/api";
import { workoutsQuerySchema } from "@/lib/schemas/workout";
import { getWorkoutTrends } from "@/server/services/workouts";

export const runtime = "nodejs";

/** Read recent Apple Watch workouts + a daily-minutes series for the trends panel. */
export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams;
    const parsed = workoutsQuerySchema.safeParse({
      days: sp.get("days") ?? undefined,
    });
    if (!parsed.success) {
      return Response.json(parsed.error.flatten(), { status: 400 });
    }
    return Response.json(await getWorkoutTrends(parsed.data.days));
  } catch (err) {
    return jsonError(err);
  }
}
