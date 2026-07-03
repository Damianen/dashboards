import { z } from "zod";

import { jsonError } from "@/lib/api";
import { deleteSleep } from "@/server/services/sleep";

export const runtime = "nodejs";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const parsed = z.cuid().safeParse(id);
    if (!parsed.success) {
      return Response.json(parsed.error.flatten(), { status: 400 });
    }
    return Response.json(await deleteSleep(parsed.data));
  } catch (err) {
    return jsonError(err);
  }
}
