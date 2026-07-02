import { jsonError } from "@/lib/api";
import { recentLoggablesQuerySchema } from "@/lib/schemas/food";
import { listRecentLoggables } from "@/server/services/food";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const parsed = recentLoggablesQuerySchema.safeParse({
      limit: new URL(req.url).searchParams.get("limit") ?? undefined,
    });
    if (!parsed.success) {
      return Response.json(parsed.error.flatten(), { status: 400 });
    }
    return Response.json(await listRecentLoggables(parsed.data.limit));
  } catch (err) {
    return jsonError(err);
  }
}
