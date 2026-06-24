import { jsonError } from "@/lib/api";
import { reorderSupplementsSchema } from "@/lib/schemas/supplement";
import { reorder } from "@/server/services/supplements";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const parsed = reorderSupplementsSchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json(parsed.error.flatten(), { status: 400 });
    }
    return Response.json(await reorder(parsed.data));
  } catch (err) {
    return jsonError(err);
  }
}
