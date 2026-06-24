import { jsonError } from "@/lib/api";
import { checkSchema } from "@/lib/schemas/supplement";
import { uncheck } from "@/server/services/supplements";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const parsed = checkSchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json(parsed.error.flatten(), { status: 400 });
    }
    return Response.json(await uncheck(parsed.data));
  } catch (err) {
    return jsonError(err);
  }
}
