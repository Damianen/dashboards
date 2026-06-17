import { jsonError } from "@/lib/api";
import { archiveTemplateSchema } from "@/lib/schemas/template";
import { setArchived } from "@/server/services/templates";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const parsed = archiveTemplateSchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json(parsed.error.flatten(), { status: 400 });
    }
    return Response.json(await setArchived(id, parsed.data.archived));
  } catch (err) {
    return jsonError(err);
  }
}
