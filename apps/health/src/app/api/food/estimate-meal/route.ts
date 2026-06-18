import { jsonError } from "@/lib/api";
import { estimateMealInputSchema } from "@/lib/schemas/vision";
import { estimateMeal } from "@/server/services/food";
import { VisionError } from "@/server/services/vision";

export const runtime = "nodejs";

/**
 * Estimate a meal/plate photo (the restaurant / no-label fallback) into a DRAFT:
 * { description, components, totals, confidence, assumptions, caveat }. Persists
 * NOTHING — logging is a separate POST to /api/food/entries via the customName
 * path (CLAUDE.md: vision endpoints have no side effects). These are ROUGH AI
 * estimates the user confirms and edits before they log. A vision failure is an
 * upstream problem (502), not a client-input error, and its message is already
 * generic — the UI uses it to fall back to manual entry.
 */
export async function POST(req: Request) {
  try {
    const parsed = estimateMealInputSchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json(parsed.error.flatten(), { status: 400 });
    }
    return Response.json(await estimateMeal(parsed.data.imageDataUrl));
  } catch (err) {
    if (err instanceof VisionError) {
      return Response.json({ error: err.message }, { status: 502 });
    }
    return jsonError(err);
  }
}
