import { z } from "zod";

export const logStimulantSchema = z.strictObject({
  amountMg: z.number().gt(0).max(2000),
  substance: z.string().trim().min(1).default("caffeine"),
  notes: z.string().optional(),
  loggedAt: z.iso.datetime({ offset: true }).optional(),
});
export type LogStimulantInput = z.infer<typeof logStimulantSchema>;
