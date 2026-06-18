import { jsonError } from "@/lib/api";
import { duplicateTemplate } from "@/server/services/templates";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    return Response.json(await duplicateTemplate(id));
  } catch (err) {
    return jsonError(err);
  }
}
