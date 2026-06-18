import { jsonError } from "@/lib/api";
import { scanLabelInputSchema } from "@/lib/schemas/vision";
import { scanLabel } from "@/server/services/food";
import { VisionError } from "@/server/services/vision";

export const runtime = "nodejs";

/**
 * Read a nutrition-label photo into a DRAFT custom food. Returns { draft,
 * confidence, notes } and persists NOTHING — saving is a separate POST to
 * /api/food/custom (CLAUDE.md: vision endpoints have no side effects). A vision
 * failure is an upstream problem (502), not a client-input error, and its message
 * is already generic — the UI uses it to fall back to manual entry.
 */
export async function POST(req: Request) {
  try {
    const parsed = scanLabelInputSchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json(parsed.error.flatten(), { status: 400 });
    }
    return Response.json(await scanLabel(parsed.data.imageDataUrl));
  } catch (err) {
    if (err instanceof VisionError) {
      return Response.json({ error: err.message }, { status: 502 });
    }
    return jsonError(err);
  }
}
