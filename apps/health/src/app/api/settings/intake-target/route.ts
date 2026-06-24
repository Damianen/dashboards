import { jsonError } from "@/lib/api";
import { intakeTargetSchema } from "@/lib/schemas/settings";
import {
  getIntakeKcalTarget,
  setIntakeKcalTarget,
} from "@/server/services/settings";

export const runtime = "nodejs";

/** The current daily intake calorie target (kcal), or null when unset. */
export async function GET() {
  try {
    return Response.json({ kcal: await getIntakeKcalTarget() });
  } catch (err) {
    return jsonError(err);
  }
}

/** Set the daily intake calorie target (kcal). Body: { kcal }. Intake-only goal. */
export async function PATCH(req: Request) {
  try {
    const parsed = intakeTargetSchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json(parsed.error.flatten(), { status: 400 });
    }
    return Response.json({ kcal: await setIntakeKcalTarget(parsed.data.kcal) });
  } catch (err) {
    return jsonError(err);
  }
}
