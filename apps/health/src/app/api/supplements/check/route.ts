import { jsonError } from "@/lib/api";
import { checkSchema } from "@/lib/schemas/supplement";
import { check } from "@/server/services/supplements";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const parsed = checkSchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json(parsed.error.flatten(), { status: 400 });
    }
    return Response.json(await check(parsed.data, "PWA"));
  } catch (err) {
    return jsonError(err);
  }
}
