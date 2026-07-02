import { z } from "zod";

import { jsonError } from "@/lib/api";
import { updateCustomFoodSchema } from "@/lib/schemas/food";
import { getCustomFood, updateCustomFood } from "@/server/services/food";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const parsed = z.cuid().safeParse(id);
    if (!parsed.success) {
      return Response.json(parsed.error.flatten(), { status: 400 });
    }
    return Response.json(await getCustomFood(parsed.data));
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
    const idParsed = z.cuid().safeParse(id);
    if (!idParsed.success) {
      return Response.json(idParsed.error.flatten(), { status: 400 });
    }
    const parsed = updateCustomFoodSchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json(parsed.error.flatten(), { status: 400 });
    }
    return Response.json(await updateCustomFood(idParsed.data, parsed.data));
  } catch (err) {
    return jsonError(err);
  }
}
