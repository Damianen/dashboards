import { jsonError } from "@/lib/api";
import { todayLocal } from "@/lib/dates";
import { daySchema } from "@/lib/schemas/common";
import { getAdherence } from "@/server/services/adherence";

export const runtime = "nodejs";

// Read-only: the day's protein target (latest weight × g/kg) vs logged protein, plus the
// food-logging and supplement-completion streaks. Intake-only — never nets calories.
export async function GET(req: Request) {
  try {
    const parsed = daySchema.safeParse(
      new URL(req.url).searchParams.get("day") ?? todayLocal(),
    );
    if (!parsed.success) {
      return Response.json(parsed.error.flatten(), { status: 400 });
    }
    return Response.json(await getAdherence(parsed.data));
  } catch (err) {
    return jsonError(err);
  }
}
