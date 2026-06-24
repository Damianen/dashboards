import { jsonError } from "@/lib/api";
import { proteinSettingSchema } from "@/lib/schemas/settings";
import { getProteinGPerKg, setProteinGPerKg } from "@/server/services/settings";

export const runtime = "nodejs";

/** The current protein-target factor (g/kg). */
export async function GET() {
  try {
    return Response.json({ gPerKg: await getProteinGPerKg() });
  } catch (err) {
    return jsonError(err);
  }
}

/** Update the protein-target factor (g/kg). Body: { gPerKg }. */
export async function PATCH(req: Request) {
  try {
    const parsed = proteinSettingSchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json(parsed.error.flatten(), { status: 400 });
    }
    return Response.json({ gPerKg: await setProteinGPerKg(parsed.data.gPerKg) });
  } catch (err) {
    return jsonError(err);
  }
}
