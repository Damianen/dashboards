import { jsonError } from "@/lib/api";
import { e1rmHistoryQuerySchema } from "@/lib/schemas/lifting";
import { getE1rmHistory } from "@/server/services/lifting";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams;
    const parsed = e1rmHistoryQuerySchema.safeParse({
      exercise: sp.get("exercise") ?? undefined,
      days: sp.get("days") ?? undefined,
    });
    if (!parsed.success) {
      return Response.json(parsed.error.flatten(), { status: 400 });
    }
    return Response.json(
      await getE1rmHistory(parsed.data.exercise, parsed.data.days),
    );
  } catch (err) {
    return jsonError(err);
  }
}
