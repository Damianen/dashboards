import { jsonError } from "@/lib/api";
import { todayLocal } from "@/lib/dates";
import { daySchema } from "@/lib/schemas/common";
import { logWaterSchema } from "@/lib/schemas/water";
import { getWaterStatus, logWater } from "@/server/services/water";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const parsed = logWaterSchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json(parsed.error.flatten(), { status: 400 });
    }
    return Response.json(await logWater(parsed.data, "PWA"));
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
    return Response.json(await getWaterStatus(parsed.data));
  } catch (err) {
    return jsonError(err);
  }
}
