import { jsonError } from "@/lib/api";
import { groupCheckSchema } from "@/lib/schemas/supplement";
import { uncheckGroup } from "@/server/services/supplements";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const parsed = groupCheckSchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json(parsed.error.flatten(), { status: 400 });
    }
    return Response.json(await uncheckGroup(parsed.data));
  } catch (err) {
    return jsonError(err);
  }
}
