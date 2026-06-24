import { jsonError } from "@/lib/api";
import { createMealSchema } from "@/lib/schemas/meals";
import { createMeal, listMeals } from "@/server/services/meals";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const parsed = createMealSchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json(parsed.error.flatten(), { status: 400 });
    }
    return Response.json(await createMeal(parsed.data));
  } catch (err) {
    return jsonError(err);
  }
}

export async function GET(req: Request) {
  try {
    const includeArchived =
      new URL(req.url).searchParams.get("includeArchived") === "true";
    return Response.json(await listMeals({ includeArchived }));
  } catch (err) {
    return jsonError(err);
  }
}
