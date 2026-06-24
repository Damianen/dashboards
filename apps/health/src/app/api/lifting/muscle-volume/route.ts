import { jsonError } from "@/lib/api";
import { muscleVolumeQuerySchema } from "@/lib/schemas/lifting";
import { getMuscleGroupWeeklyVolume } from "@/server/services/lifting";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams;
    const parsed = muscleVolumeQuerySchema.safeParse({
      weeks: sp.get("weeks") ?? undefined,
    });
    if (!parsed.success) {
      return Response.json(parsed.error.flatten(), { status: 400 });
    }
    return Response.json(await getMuscleGroupWeeklyVolume(parsed.data.weeks));
  } catch (err) {
    return jsonError(err);
  }
}
