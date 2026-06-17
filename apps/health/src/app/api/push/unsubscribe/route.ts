import { jsonError } from "@/lib/api";
import { unsubscribeSchema } from "@/lib/schemas/push";
import { removeSubscription } from "@/server/services/push";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  try {
    const parsed = unsubscribeSchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json(parsed.error.flatten(), { status: 400 });
    }
    await removeSubscription(parsed.data.endpoint);
    return Response.json({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
