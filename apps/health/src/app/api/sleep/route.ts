import { jsonError } from "@/lib/api";
import { logSleepSchema } from "@/lib/schemas/sleep";
import { logSleep } from "@/server/services/sleep";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const parsed = logSleepSchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json(parsed.error.flatten(), { status: 400 });
    }
    return Response.json(await logSleep(parsed.data));
  } catch (err) {
    return jsonError(err);
  }
}
