import { jsonError } from "@/lib/api";
import { weightGoalSchema } from "@/lib/schemas/settings";
import { getWeightGoalKg, setWeightGoalKg } from "@/server/services/settings";

export const runtime = "nodejs";

/** The current goal weight (kg), or null when unset. */
export async function GET() {
  try {
    return Response.json({ goalKg: await getWeightGoalKg() });
  } catch (err) {
    return jsonError(err);
  }
}

/** Set the goal weight (kg). Body: { goalKg }. */
export async function PATCH(req: Request) {
  try {
    const parsed = weightGoalSchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json(parsed.error.flatten(), { status: 400 });
    }
    return Response.json({ goalKg: await setWeightGoalKg(parsed.data.goalKg) });
  } catch (err) {
    return jsonError(err);
  }
}
