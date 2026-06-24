import { jsonError } from "@/lib/api";
import { updateSetSchema } from "@/lib/schemas/lifting";
import { deleteSet, updateSet } from "@/server/services/lifting";

export const runtime = "nodejs";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const parsed = updateSetSchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json(parsed.error.flatten(), { status: 400 });
    }
    return Response.json(await updateSet(id, parsed.data));
  } catch (err) {
    return jsonError(err);
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    await deleteSet(id);
    return new Response(null, { status: 204 });
  } catch (err) {
    return jsonError(err);
  }
}
