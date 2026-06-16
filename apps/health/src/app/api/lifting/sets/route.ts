import { jsonError } from "@/lib/api";
import { logSetSchema } from "@/lib/schemas/lifting";
import { logSet } from "@/server/services/lifting";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const parsed = logSetSchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json(parsed.error.flatten(), { status: 400 });
    }
    return Response.json(await logSet(parsed.data, "PWA"));
  } catch (err) {
    return jsonError(err);
  }
}
