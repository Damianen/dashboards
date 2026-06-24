import { z } from "zod";

/**
 * A per-exercise target, discriminated on `targetType`:
 *  - REPS:   N sets in a rep range (e.g. 4 × 6–10), optional working weight and
 *            per-progression weight increment.
 *  - VOLUME: a single Σ reps×weightKg goal (e.g. 5000 kg of back work).
 * superRefine enforces repMin ≤ repMax in REPS mode. The branches use `z.object`
 * (not strictObject) so this schema can be intersected with the exercise fields
 * below — intersection parses the same input through both halves.
 */
export const templateTargetSchema = z
  .discriminatedUnion("targetType", [
    z.object({
      targetType: z.literal("REPS"),
      targetSets: z.number().int().min(1).max(20),
      repMin: z.number().int().min(1).max(100),
      repMax: z.number().int().min(1).max(100),
      targetWeightKg: z.number().min(0).max(500).optional(),
      weightIncrementKg: z.number().gt(0).max(50).optional(),
    }),
    z.object({
      targetType: z.literal("VOLUME"),
      targetVolumeKg: z.number().gt(0).max(100000),
    }),
  ])
  .superRefine((val, ctx) => {
    if (val.targetType === "REPS" && val.repMin > val.repMax) {
      ctx.addIssue({
        code: "custom",
        message: "repMin must be ≤ repMax",
        path: ["repMax"],
      });
    }
  });
export type TemplateTargetInput = z.infer<typeof templateTargetSchema>;

/**
 * One pre-defined warmup set, discriminated on `weightMode`:
 *  - ABSOLUTE: a fixed weightKg;
 *  - PERCENT:  a percentOfWorking (1–100) of the exercise's working weight.
 * Like templateTargetSchema the branches are z.object (non-strict) so this composes
 * inside the exercise schema's intersection. The discriminator enforces exactly-one
 * of weightKg / percentOfWorking. Array position IS the warmup's stored position.
 */
export const warmupSetInputSchema = z.discriminatedUnion("weightMode", [
  z.object({
    weightMode: z.literal("ABSOLUTE"),
    reps: z.number().int().min(1).max(100),
    weightKg: z.number().gt(0).max(500),
  }),
  z.object({
    weightMode: z.literal("PERCENT"),
    reps: z.number().int().min(1).max(100),
    percentOfWorking: z.number().min(1).max(100),
  }),
]);
export type WarmupSetInput = z.infer<typeof warmupSetInputSchema>;

/** One exercise within a template: a target plus which exercise, rest, notes, and an
 *  ordered list of warmup sets. Array position in the parent template IS the
 *  exercise's stored position; warmups[].position is likewise the array index. */
export const templateExerciseInputSchema = templateTargetSchema.and(
  z.object({
    exerciseId: z.cuid(),
    restSec: z.number().int().min(0).max(3600).optional(),
    notes: z.string().optional(),
    warmups: z.array(warmupSetInputSchema).max(10).default([]),
  }),
);
export type TemplateExerciseInput = z.infer<typeof templateExerciseInputSchema>;

/** Create a template. The order of `exercises` defines each item's position. */
export const createTemplateSchema = z.strictObject({
  name: z.string().trim().min(1),
  notes: z.string().optional(),
  exercises: z.array(templateExerciseInputSchema).min(1),
});
export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;

/** Update is a full replace of metadata + the exercise list (positions re-derived
 *  from array order), so it shares the create shape. */
export const updateTemplateSchema = createTemplateSchema;
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;

/** Start a session by snapshotting a template. `startedAt` defaults to now. */
export const startFromTemplateSchema = z.strictObject({
  templateId: z.cuid(),
  startedAt: z.iso.datetime().optional(),
});
export type StartFromTemplateInput = z.infer<typeof startFromTemplateSchema>;

/** Query for the list route: `?includeArchived=true` includes archived templates. */
export const listTemplatesQuerySchema = z.strictObject({
  includeArchived: z.stringbool().default(false),
});
export type ListTemplatesQuery = z.infer<typeof listTemplatesQuerySchema>;

/** Body for the archive toggle route. */
export const archiveTemplateSchema = z.strictObject({
  archived: z.boolean(),
});
export type ArchiveTemplateInput = z.infer<typeof archiveTemplateSchema>;
