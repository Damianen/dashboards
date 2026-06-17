import { jsonError } from "@/lib/api";
import { updateTemplateSchema } from "@/lib/schemas/template";
import { getTemplate, updateTemplate } from "@/server/services/templates";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    return Response.json(await getTemplate(id));
  } catch (err) {
    return jsonError(err);
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const parsed = updateTemplateSchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json(parsed.error.flatten(), { status: 400 });
    }
    return Response.json(await updateTemplate(id, parsed.data));
  } catch (err) {
    return jsonError(err);
  }
}
