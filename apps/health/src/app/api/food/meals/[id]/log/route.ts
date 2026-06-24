import { jsonError } from "@/lib/api";
import { logMealSchema } from "@/lib/schemas/meals";
import { logMeal } from "@/server/services/meals";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body: unknown = await req.json();
    const parsed = logMealSchema.safeParse({
      ...(body && typeof body === "object" ? body : {}),
      mealId: id,
    });
    if (!parsed.success) {
      return Response.json(parsed.error.flatten(), { status: 400 });
    }
    return Response.json(await logMeal(parsed.data, "PWA"));
  } catch (err) {
    return jsonError(err);
  }
}
