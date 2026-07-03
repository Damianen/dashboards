import { jsonError } from "@/lib/api";
import { briefingSettingsSchema } from "@/lib/schemas/briefing";
import {
  getBriefingSettings,
  setBriefingSettings,
} from "@/server/services/settings";

export const runtime = "nodejs";

/** The briefing settings (notification slots, mode cutoff, suggestion thresholds). */
export async function GET() {
  try {
    return Response.json(await getBriefingSettings());
  } catch (err) {
    return jsonError(err);
  }
}

/** Set all briefing settings. Body: { morning, evening, modeCutoffHour, thresholds }. */
export async function PATCH(req: Request) {
  try {
    const parsed = briefingSettingsSchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json(parsed.error.flatten(), { status: 400 });
    }
    return Response.json(await setBriefingSettings(parsed.data));
  } catch (err) {
    return jsonError(err);
  }
}
