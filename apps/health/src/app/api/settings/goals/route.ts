import { jsonError } from "@/lib/api";
import { goalSettingsSchema } from "@/lib/schemas/settings";
import {
  getGoalSettings,
  setGoalSettings,
} from "@/server/services/settings";

export const runtime = "nodejs";

/** The current goal-feature settings (rate caps, floor, adjustment cap,
 *  auto-apply, per-phase protein factors). */
export async function GET() {
  try {
    return Response.json(await getGoalSettings());
  } catch (err) {
    return jsonError(err);
  }
}

/** Set all goal-feature settings. Body: the full GoalSettings object. */
export async function PATCH(req: Request) {
  try {
    const parsed = goalSettingsSchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json(parsed.error.flatten(), { status: 400 });
    }
    return Response.json(await setGoalSettings(parsed.data));
  } catch (err) {
    return jsonError(err);
  }
}
