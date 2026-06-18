import { z } from "zod";

export const logSupplementSchema = z.strictObject({
  name: z.string().trim().min(1),
  dose: z.number().gt(0),
  unit: z.string().trim().min(1),
  loggedAt: z.iso.datetime({ offset: true }).optional(),
});
export type LogSupplementInput = z.infer<typeof logSupplementSchema>;
