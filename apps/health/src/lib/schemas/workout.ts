import { z } from "zod";

/** Query for GET /api/workouts — the range backing the trends Workouts panel. */
export const workoutsQuerySchema = z.strictObject({
  days: z.coerce.number().int().min(1).max(365).default(30),
});
export type WorkoutsQuery = z.infer<typeof workoutsQuerySchema>;
