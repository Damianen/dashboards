import { jsonError } from "@/lib/api";
import { todayLocal } from "@/lib/dates";
import { daySchema } from "@/lib/schemas/common";
import { logSupplementSchema } from "@/lib/schemas/supplement";
import { listByDay, logSupplement } from "@/server/services/supplements";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const parsed = logSupplementSchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json(parsed.error.flatten(), { status: 400 });
    }
    return Response.json(await logSupplement(parsed.data, "PWA"));
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
