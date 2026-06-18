import { jsonError } from "@/lib/api";
import { pushSubscriptionSchema } from "@/lib/schemas/push";
import { saveSubscription } from "@/server/services/push";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  try {
    const parsed = pushSubscriptionSchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json(parsed.error.flatten(), { status: 400 });
    }
    await saveSubscription(parsed.data);
    return Response.json({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
