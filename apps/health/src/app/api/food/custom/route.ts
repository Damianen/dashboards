import { jsonError } from "@/lib/api";
import { createCustomFoodSchema } from "@/lib/schemas/food";
import {
  createCustomFood,
  listCustomFoods,
  searchCustomFoods,
} from "@/server/services/food";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const parsed = createCustomFoodSchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json(parsed.error.flatten(), { status: 400 });
    }
    return Response.json(await createCustomFood(parsed.data));
  } catch (err) {
    return jsonError(err);
  }
}

export async function GET(req: Request) {
  try {
    const q = new URL(req.url).searchParams.get("q")?.trim();
    return Response.json(await (q ? searchCustomFoods(q) : listCustomFoods()));
  } catch (err) {
    return jsonError(err);
  }
}
