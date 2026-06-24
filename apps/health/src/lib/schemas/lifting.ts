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

/** A partial edit of an already-logged set. Every field is optional, but at least
 *  one must be present. `rpe: null` clears the RPE; omitting a field leaves it
 *  untouched. */
export const updateSetSchema = z
  .strictObject({
    reps: z.number().int().min(1).max(100).optional(),
    weightKg: z.number().min(0).max(500).optional(),
    rpe: z.number().min(1).max(10).nullable().optional(),
    isWarmup: z.boolean().optional(),
  })
  .refine(
    (v) => Object.values(v).some((x) => x !== undefined),
    "provide at least one field to update",
  );
export type UpdateSetInput = z.infer<typeof updateSetSchema>;

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
