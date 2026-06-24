import { jsonError } from "@/lib/api";
import { finishSession } from "@/server/services/lifting";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    return Response.json(await finishSession(id));
  } catch (err) {
    return jsonError(err);
  }
}
