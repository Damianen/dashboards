import { jsonError } from "@/lib/api";
import { todayLocal } from "@/lib/dates";
import { applyDailyPlanSchema } from "@/lib/schemas/daily-plans";
import { applyDailyPlan } from "@/server/services/dailyPlans";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body: unknown = await req.json().catch(() => ({}));
    const parsed = applyDailyPlanSchema.safeParse({
      ...(body && typeof body === "object" ? body : {}),
      dailyPlanId: id,
    });
    if (!parsed.success) {
      return Response.json(parsed.error.flatten(), { status: 400 });
    }
    return Response.json(
      await applyDailyPlan(
        parsed.data.dailyPlanId,
        parsed.data.day ?? todayLocal(),
        "PWA",
      ),
    );
  } catch (err) {
    return jsonError(err);
  }
}
