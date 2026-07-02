import { jsonError } from "@/lib/api";
import { waterSettingsSchema } from "@/lib/schemas/settings";
import {
  getWaterSettings,
  setWaterSettings,
} from "@/server/services/settings";

export const runtime = "nodejs";

/** The current water-target inputs (base ml + ml per mg stimulant). */
export async function GET() {
  try {
    return Response.json(await getWaterSettings());
  } catch (err) {
    return jsonError(err);
  }
}

/** Set both water-target inputs. Body: { baseTargetMl, mlPerMgStimulant }. */
export async function PATCH(req: Request) {
  try {
    const parsed = waterSettingsSchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json(parsed.error.flatten(), { status: 400 });
    }
    return Response.json(await setWaterSettings(parsed.data));
  } catch (err) {
    return jsonError(err);
  }
}
