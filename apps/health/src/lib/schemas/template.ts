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

/** One exercise within a template: a target plus which exercise, rest, and notes.
 *  Array position in the parent template IS the exercise's stored position. */
export const templateExerciseInputSchema = templateTargetSchema.and(
  z.object({
    exerciseId: z.cuid(),
    restSec: z.number().int().min(0).max(3600).optional(),
    notes: z.string().optional(),
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
