import { z } from "zod";

/**
 * The protein-target factor in grams per kg of bodyweight. Single source of truth for the
 * PATCH /api/settings/protein body. Bounded 0.1–10 g/kg — wide enough for any real diet,
 * tight enough to reject a fat-fingered value. Coerced so a form string ("2.0") parses.
 */
export const proteinSettingSchema = z.strictObject({
  gPerKg: z.coerce.number().min(0.1).max(10),
});
export type ProteinSetting = z.infer<typeof proteinSettingSchema>;
