import { jsonError } from "@/lib/api";
import { setTdeeWindowSchema, tdeeQuerySchema } from "@/lib/schemas/insights";
import { setTdeeWindowDays } from "@/server/services/settings";
import { getTdeeEstimate } from "@/server/services/tdee";

export const runtime = "nodejs";

// Read-only: returns the empirical TDEE estimate for the given (or stored-default)
// window. Pure GET — it never persists; changing the default is the explicit PATCH.
export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams;
    const parsed = tdeeQuerySchema.safeParse({
      window: sp.get("window") ?? undefined,
    });
    if (!parsed.success) {
      return Response.json(parsed.error.flatten(), { status: 400 });
    }
    return Response.json(await getTdeeEstimate(parsed.data.window));
  } catch (err) {
    return jsonError(err);
  }
}

// Persist the default window (14/21/28). Separate from GET so fetching can never have
// a side effect; the card's window selector calls this to remember the choice.
export async function PATCH(req: Request) {
  try {
    const parsed = setTdeeWindowSchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json(parsed.error.flatten(), { status: 400 });
    }
    await setTdeeWindowDays(parsed.data.windowDays);
    return Response.json({ windowDays: parsed.data.windowDays });
  } catch (err) {
    return jsonError(err);
  }
}
