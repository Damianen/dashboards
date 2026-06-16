import { jsonError } from "@/lib/api";
import { todayLocal } from "@/lib/dates";
import { daySchema } from "@/lib/schemas/common";
import { logStimulantSchema } from "@/lib/schemas/stimulant";
import { listByDay, logStimulant } from "@/server/services/stimulants";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const parsed = logStimulantSchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json(parsed.error.flatten(), { status: 400 });
    }
    return Response.json(await logStimulant(parsed.data, "PWA"));
  } catch (err) {
    return jsonError(err);
  }
}

export async function GET(req: Request) {
  try {
    const parsed = daySchema.safeParse(
      new URL(req.url).searchParams.get("day") ?? todayLocal(),
    );
    if (!parsed.success) {
      return Response.json(parsed.error.flatten(), { status: 400 });
    }
    return Response.json(await listByDay(parsed.data));
  } catch (err) {
    return jsonError(err);
  }
}
