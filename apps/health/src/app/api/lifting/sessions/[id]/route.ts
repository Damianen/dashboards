import { jsonError } from "@/lib/api";
import { deleteSession, getSession } from "@/server/services/lifting";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    return Response.json(await getSession(id));
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
    await deleteSession(id);
    return new Response(null, { status: 204 });
  } catch (err) {
    return jsonError(err);
  }
}
