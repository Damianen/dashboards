import { z } from "zod";

import { daySchema } from "@/lib/schemas/common";

export const logSetSchema = z
  .strictObject({
    exerciseId: z.cuid().optional(),
    exerciseName: z.string().trim().min(1).optional(),
    reps: z.number().int().min(1).max(100),
    weightKg: z.number().min(0).max(500),
    rpe: z.number().min(1).max(10).optional(),
    isWarmup: z.boolean().default(false),
  })
  .refine(
    (v) => (v.exerciseId == null) !== (v.exerciseName == null),
    "provide exactly one of exerciseId or exerciseName",
  );
export type LogSetInput = z.infer<typeof logSetSchema>;

export const historyQuerySchema = z.strictObject({
  exercise: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});
export type HistoryQuery = z.infer<typeof historyQuerySchema>;

export const sessionsQuerySchema = z.strictObject({
  // Omit `day` for the recent-sessions list; pass it for a single day's sessions.
  day: daySchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});
export type SessionsQuery = z.infer<typeof sessionsQuerySchema>;
