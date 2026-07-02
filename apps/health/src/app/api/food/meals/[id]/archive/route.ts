import { z } from "zod";

import { jsonError } from "@/lib/api";
import { archiveMealSchema } from "@/lib/schemas/meals";
import { setMealArchived } from "@/server/services/meals";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const idParsed = z.cuid().safeParse(id);
    if (!idParsed.success) {
      return Response.json(idParsed.error.flatten(), { status: 400 });
    }
    // A bare POST archives; { archived: false } restores. Tolerate an empty body.
    const body = await req.json().catch(() => ({}));
    const parsed = archiveMealSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(parsed.error.flatten(), { status: 400 });
    }
    return Response.json(
      await setMealArchived(idParsed.data, parsed.data.archived),
    );
  } catch (err) {
    return jsonError(err);
  }
}
