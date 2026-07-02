import { z } from "zod";

/**
 * A manual body-weight measurement. Single source of truth for the POST
 * /api/weight body AND the MCP log_weight tool. weightKg bounded 20–350 —
 * Decimal(5,2)-safe and wide enough for any adult; measuredAt defaults to now.
 */
export const logWeightSchema = z.strictObject({
  weightKg: z.number().min(20).max(350),
  measuredAt: z.iso.datetime({ offset: true }).optional(),
});
export type LogWeightInput = z.infer<typeof logWeightSchema>;
