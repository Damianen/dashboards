import { jsonError } from "@/lib/api";
import { todayLocal } from "@/lib/dates";
import { daySchema } from "@/lib/schemas/common";
import { getDailySummary } from "@/server/services/summary";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const parsed = daySchema.safeParse(
      new URL(req.url).searchParams.get("day") ?? todayLocal(),
    );
    if (!parsed.success) {
      return Response.json(parsed.error.flatten(), { status: 400 });
    }
    return Response.json(await getDailySummary(parsed.data));
  } catch (err) {
    return jsonError(err);
  }
}
