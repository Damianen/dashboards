import { z } from "zod";

import { jsonError } from "@/lib/api";
import { updateFoodEntrySchema } from "@/lib/schemas/food";
import { deleteEntry, updateFoodEntry } from "@/server/services/food";

export const runtime = "nodejs";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const idParsed = z.cuid().safeParse(id);
    if (!idParsed.success) {
      return Response.json(idParsed.error.flatten(), { status: 400 });
    }
    const parsed = updateFoodEntrySchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json(parsed.error.flatten(), { status: 400 });
    }
    return Response.json(await updateFoodEntry(idParsed.data, parsed.data));
  } catch (err) {
    return jsonError(err);
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    await deleteEntry(id);
    return Response.json({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
