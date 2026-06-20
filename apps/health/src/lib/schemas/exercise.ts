import { z } from "zod";

/** Create a catalog exercise. `name` is unique case-insensitively (enforced in
 *  the service); `muscleGroup` is an optional free-text tag. */
export const createExerciseSchema = z.strictObject({
  name: z.string().trim().min(1).max(80),
  muscleGroup: z.string().trim().min(1).max(40).optional(),
});
export type CreateExerciseInput = z.infer<typeof createExerciseSchema>;
