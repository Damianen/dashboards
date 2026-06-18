import { jsonError } from "@/lib/api";
import { sessionsQuerySchema } from "@/lib/schemas/lifting";
import { listSessions } from "@/server/services/lifting";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams;
    const parsed = sessionsQuerySchema.safeParse({
      day: sp.get("day") ?? undefined,
      limit: sp.get("limit") ?? undefined,
    });
    if (!parsed.success) {
      return Response.json(parsed.error.flatten(), { status: 400 });
    }
    return Response.json(
      await listSessions(parsed.data.day, parsed.data.limit),
    );
  } catch (err) {
    return jsonError(err);
  }
}
