import { jsonError } from "@/lib/api";
import {
  createTemplateSchema,
  listTemplatesQuerySchema,
} from "@/lib/schemas/template";
import { createTemplate, listTemplates } from "@/server/services/templates";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams;
    const parsed = listTemplatesQuerySchema.safeParse({
      includeArchived: sp.get("includeArchived") ?? undefined,
    });
    if (!parsed.success) {
      return Response.json(parsed.error.flatten(), { status: 400 });
    }
    return Response.json(
      await listTemplates({ includeArchived: parsed.data.includeArchived }),
    );
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(req: Request) {
  try {
    const parsed = createTemplateSchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json(parsed.error.flatten(), { status: 400 });
    }
    return Response.json(await createTemplate(parsed.data));
  } catch (err) {
    return jsonError(err);
  }
}
