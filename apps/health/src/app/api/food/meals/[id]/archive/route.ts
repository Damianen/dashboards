import { z } from "zod";

import { jsonError } from "@/lib/api";
import { archiveMeal } from "@/server/services/meals";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const parsed = z.cuid().safeParse(id);
    if (!parsed.success) {
      return Response.json(parsed.error.flatten(), { status: 400 });
    }
    return Response.json(await archiveMeal(parsed.data));
  } catch (err) {
    return jsonError(err);
  }
}
