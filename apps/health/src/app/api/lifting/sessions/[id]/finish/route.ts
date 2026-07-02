import { jsonError } from "@/lib/api";
import { finishSessionSchema } from "@/lib/schemas/lifting";
import { setSessionFinished } from "@/server/services/lifting";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    // A bare POST finishes; { finished: false } reopens. Tolerate an empty body.
    const body = await req.json().catch(() => ({}));
    const parsed = finishSessionSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(parsed.error.flatten(), { status: 400 });
    }
    return Response.json(await setSessionFinished(id, parsed.data.finished));
  } catch (err) {
    return jsonError(err);
  }
}
