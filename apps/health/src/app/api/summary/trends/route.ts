import { jsonError } from "@/lib/api";
import { trendsQuerySchema } from "@/lib/schemas/summary";
import { getTrends } from "@/server/services/summary";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams;
    const parsed = trendsQuerySchema.safeParse({
      metric: sp.get("metric") ?? undefined,
      days: sp.get("days") ?? undefined,
    });
    if (!parsed.success) {
      return Response.json(parsed.error.flatten(), { status: 400 });
    }
    return Response.json(await getTrends(parsed.data.metric, parsed.data.days));
  } catch (err) {
    return jsonError(err);
  }
}
