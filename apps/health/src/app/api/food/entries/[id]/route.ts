import { jsonError } from "@/lib/api";
import { deleteEntry } from "@/server/services/food";

export const runtime = "nodejs";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    await deleteEntry(id);
    return Response.json({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
