import { jsonError } from "@/lib/api";
import { updateSupplementSchema } from "@/lib/schemas/supplement";
import { update } from "@/server/services/supplements";

export const runtime = "nodejs";

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const parsed = updateSupplementSchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json(parsed.error.flatten(), { status: 400 });
    }
    return Response.json(await update(id, parsed.data));
  } catch (err) {
    return jsonError(err);
  }
}
