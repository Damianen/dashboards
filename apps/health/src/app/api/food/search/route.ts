import { jsonError } from "@/lib/api";
import { searchQuerySchema } from "@/lib/schemas/food";
import { searchProducts } from "@/server/services/off";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams;
    const parsed = searchQuerySchema.safeParse({
      q: sp.get("q") ?? undefined,
      pageSize: sp.get("pageSize") ?? undefined,
    });
    if (!parsed.success) {
      return Response.json(parsed.error.flatten(), { status: 400 });
    }
    return Response.json(
      await searchProducts(parsed.data.q, parsed.data.pageSize),
    );
  } catch (err) {
    return jsonError(err);
  }
}
