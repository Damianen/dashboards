import { jsonError } from "@/lib/api";
import { createDailyPlanSchema } from "@/lib/schemas/daily-plans";
import { createDailyPlan, listDailyPlans } from "@/server/services/dailyPlans";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const parsed = createDailyPlanSchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json(parsed.error.flatten(), { status: 400 });
    }
    return Response.json(await createDailyPlan(parsed.data));
  } catch (err) {
    return jsonError(err);
  }
}

export async function GET(req: Request) {
  try {
    const includeArchived =
      new URL(req.url).searchParams.get("includeArchived") === "true";
    return Response.json(await listDailyPlans({ includeArchived }));
  } catch (err) {
    return jsonError(err);
  }
}
