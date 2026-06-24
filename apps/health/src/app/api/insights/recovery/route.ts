import { jsonError } from "@/lib/api";
import { recoveryQuerySchema } from "@/lib/schemas/insights";
import { getRecovery } from "@/server/services/recovery";

export const runtime = "nodejs";

// Read-only: resting HR, HRV and body-temperature deviation vs a rolling baseline, each with a
// per-metric flag and an overall status. A trend signal, never a diagnosis (CLAUDE.md).
export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams;
    const parsed = recoveryQuerySchema.safeParse({
      day: sp.get("day") ?? undefined,
      window: sp.get("window") ?? undefined,
    });
    if (!parsed.success) {
      return Response.json(parsed.error.flatten(), { status: 400 });
    }
    return Response.json(await getRecovery(parsed.data.day, parsed.data.window));
  } catch (err) {
    return jsonError(err);
  }
}
