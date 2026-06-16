import { z } from "zod";

export const logWaterSchema = z.strictObject({
  amountMl: z.number().int().gt(0).max(5000),
  loggedAt: z.iso.datetime({ offset: true }).optional(),
});
export type LogWaterInput = z.infer<typeof logWaterSchema>;
