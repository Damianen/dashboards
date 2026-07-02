import { z } from "zod";

import { jsonError } from "@/lib/api";
import { archiveCustomFoodSchema } from "@/lib/schemas/food";
import { setCustomFoodArchived } from "@/server/services/food";

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
    const parsed = archiveCustomFoodSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(parsed.error.flatten(), { status: 400 });
    }
    return Response.json(
      await setCustomFoodArchived(idParsed.data, parsed.data.archived),
    );
  } catch (err) {
    return jsonError(err);
  }
}
