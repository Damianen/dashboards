import { jsonError } from "@/lib/api";
import { createExerciseSchema } from "@/lib/schemas/exercise";
import { createExercise, listExercises } from "@/server/services/lifting";

export const runtime = "nodejs";

export async function GET() {
  try {
    return Response.json(await listExercises());
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(req: Request) {
  try {
    const parsed = createExerciseSchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json(parsed.error.flatten(), { status: 400 });
    }
    return Response.json(await createExercise(parsed.data));
  } catch (err) {
    return jsonError(err);
  }
}
