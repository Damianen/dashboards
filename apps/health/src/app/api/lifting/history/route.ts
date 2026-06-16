import { jsonError } from "@/lib/api";
import { historyQuerySchema } from "@/lib/schemas/lifting";
import { getHistory } from "@/server/services/lifting";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams;
    const parsed = historyQuerySchema.safeParse({
      exercise: sp.get("exercise") ?? undefined,
      limit: sp.get("limit") ?? undefined,
    });
    if (!parsed.success) {
      return Response.json(parsed.error.flatten(), { status: 400 });
    }
    return Response.json(await getHistory(parsed.data.exercise, parsed.data.limit));
  } catch (err) {
    return jsonError(err);
  }
}
