import { jsonError } from "@/lib/api";
import { rotationSchema } from "@/lib/schemas/briefing";
import { getRotation, setRotation } from "@/server/services/rotation";

export const runtime = "nodejs";

/** The workout rotation, enriched with template names + archived flags. */
export async function GET() {
  try {
    return Response.json(await getRotation());
  } catch (err) {
    return jsonError(err);
  }
}

/** Replace the rotation. Body: { entries: [{ kind: "TEMPLATE", templateId } | { kind: "REST" }] }. */
export async function PATCH(req: Request) {
  try {
    const parsed = rotationSchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json(parsed.error.flatten(), { status: 400 });
    }
    return Response.json(await setRotation(parsed.data));
  } catch (err) {
    return jsonError(err);
  }
}
