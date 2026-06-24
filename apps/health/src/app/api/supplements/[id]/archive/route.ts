import { jsonError } from "@/lib/api";
import { archiveSupplementSchema } from "@/lib/schemas/supplement";
import { setArchived } from "@/server/services/supplements";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const parsed = archiveSupplementSchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json(parsed.error.flatten(), { status: 400 });
    }
    return Response.json(await setArchived(id, parsed.data.archived));
  } catch (err) {
    return jsonError(err);
  }
}
