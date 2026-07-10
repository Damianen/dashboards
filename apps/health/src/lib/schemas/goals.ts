import { z } from "zod";

import { daySchema } from "@/lib/schemas/common";

/**
 * Create (or preview) a goal: a weight and a date; everything else — phase,
 * rate, target — is DERIVED from the empirical TDEE and the weight trend by
 * the service. Single source of truth for POST /api/goals[/preview] AND the
 * MCP inputs. Weight bounded like the weight-goal setting (20–500 kg); the
 * "targetDate ≥ 7 days out" rule is service-level (it needs today's date).
 * Coerced so form strings parse.
 */
export const createGoalSchema = z.strictObject({
  goalWeightKg: z.coerce.number().min(20).max(500),
  targetDate: daySchema,
});
export type CreateGoalInput = z.infer<typeof createGoalSchema>;

/** The live plan preview takes exactly the create inputs (nothing persists). */
export const previewGoalSchema = createGoalSchema;

/** One-tap decision on a PROPOSED weekly check-in. */
export const decideCheckInSchema = z.strictObject({
  decision: z.enum(["accept", "dismiss"]),
});
export type DecideCheckInInput = z.infer<typeof decideCheckInSchema>;
