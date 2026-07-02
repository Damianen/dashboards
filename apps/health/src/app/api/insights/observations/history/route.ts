import { jsonError } from "@/lib/api";
import { observationHistoryQuerySchema } from "@/lib/schemas/insights";
import { listNotifiedObservations } from "@/server/services/observations";

export const runtime = "nodejs";

/** Past push-notified observations, newest first. */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const parsed = observationHistoryQuerySchema.safeParse({
      limit: url.searchParams.get("limit") ?? undefined,
    });
    if (!parsed.success) {
      return Response.json(parsed.error.flatten(), { status: 400 });
    }
    return Response.json(await listNotifiedObservations(parsed.data.limit));
  } catch (err) {
    return jsonError(err);
  }
}
