import { jsonError } from "@/lib/api";
import { observationsQuerySchema } from "@/lib/schemas/insights";
import { getObservations } from "@/server/services/observations";

export const runtime = "nodejs";

// Read-only: cross-domain observations over the given (or default 30-day) window, ranked
// by |strength|. Each is a correlational hypothesis with its sample size stated.
export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams;
    const parsed = observationsQuerySchema.safeParse({
      window: sp.get("window") ?? undefined,
    });
    if (!parsed.success) {
      return Response.json(parsed.error.flatten(), { status: 400 });
    }
    return Response.json(await getObservations(parsed.data.window));
  } catch (err) {
    return jsonError(err);
  }
}
