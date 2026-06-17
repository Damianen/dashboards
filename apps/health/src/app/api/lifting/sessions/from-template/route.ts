import { jsonError } from "@/lib/api";
import { startFromTemplateSchema } from "@/lib/schemas/template";
import { startSessionFromTemplate } from "@/server/services/templates";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const parsed = startFromTemplateSchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json(parsed.error.flatten(), { status: 400 });
    }
    return Response.json(await startSessionFromTemplate(parsed.data));
  } catch (err) {
    return jsonError(err);
  }
}
