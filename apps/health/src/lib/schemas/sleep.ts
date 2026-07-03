import { z } from "zod";

/**
 * A manual sleep entry — the fallback for nights Oura missed (outage, dead
 * battery, forgotten ring). Single source of truth for the POST /api/sleep
 * body AND the MCP log_sleep tool. Two shapes, mirroring how people report
 * sleep: exact bedtimes (bedtimeStart [+ bedtimeEnd]) or just a duration
 * ("slept 7h30, woke just now" — durationMin [+ bedtimeEnd]). Exactly one of
 * bedtimeStart / durationMin; bedtimeEnd defaults to now at the service layer
 * (the logWeightSchema.measuredAt idiom). durationMin ≤ 1440 keeps any manual
 * night within 24h; the times path's span check lives in resolveSleepWindow.
 */
export const logSleepSchema = z
  .strictObject({
    bedtimeStart: z.iso.datetime({ offset: true }).optional(),
    bedtimeEnd: z.iso.datetime({ offset: true }).optional(),
    durationMin: z.number().int().min(1).max(1440).optional(),
  })
  .refine(
    (v) => (v.bedtimeStart != null) !== (v.durationMin != null),
    "provide exactly one of bedtimeStart or durationMin",
  );
export type LogSleepInput = z.infer<typeof logSleepSchema>;
