import { jsonError } from "@/lib/api";
import {
  createSupplementSchema,
  listSupplementsQuerySchema,
} from "@/lib/schemas/supplement";
import { create, list } from "@/server/services/supplements";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams;
    const parsed = listSupplementsQuerySchema.safeParse({
      includeArchived: sp.get("includeArchived") ?? undefined,
    });
    if (!parsed.success) {
      return Response.json(parsed.error.flatten(), { status: 400 });
    }
    return Response.json(await list(parsed.data.includeArchived));
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(req: Request) {
  try {
    const parsed = createSupplementSchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json(parsed.error.flatten(), { status: 400 });
    }
    return Response.json(await create(parsed.data));
  } catch (err) {
    return jsonError(err);
  }
}
