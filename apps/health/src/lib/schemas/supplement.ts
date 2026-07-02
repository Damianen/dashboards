import { z } from "zod";

import { daySchema } from "@/lib/schemas/common";

/** Time-of-day bucket a supplement belongs to. Mirrors the Prisma
 *  SupplementTimeGroup enum; the array order is also the display order. */
export const supplementTimeGroupSchema = z.enum([
  "MORNING",
  "EVENING",
  "PRE_WORKOUT",
]);
export type SupplementTimeGroup = z.infer<typeof supplementTimeGroupSchema>;

/** Display labels for each time-group (UI copy). */
export const SUPPLEMENT_TIME_GROUP_LABELS: Record<SupplementTimeGroup, string> = {
  MORNING: "Morning",
  EVENING: "Evening",
  PRE_WORKOUT: "Pre-workout",
};

/** Units offered in the add/edit form (free-text is still accepted by the API). */
export const SUPPLEMENT_UNITS = [
  "mg",
  "mcg",
  "g",
  "IU",
  "ml",
  "capsule",
  "tablet",
  "drop",
] as const;

/** Add a supplement to the managed list. Position is assigned server-side. */
export const createSupplementSchema = z.strictObject({
  name: z.string().trim().min(1),
  // Max fits the Supplement/SupplementLog dose Decimal(8,2) columns — an
  // over-limit dose 400s here instead of 500ing on the insert.
  dose: z.number().gt(0).max(999999.99),
  unit: z.string().trim().min(1),
  // Caffeine per dose (mg), e.g. a pre-workout. Optional — most supplements have none.
  // Snapshotted onto each daily check; feeds the unified caffeine total / water target.
  caffeineMg: z.number().min(0).max(99999.9).optional(),
  timeGroup: supplementTimeGroupSchema,
});
export type CreateSupplementInput = z.infer<typeof createSupplementSchema>;

/** Edit the supplement's display fields (full replace). Reordering is a separate
 *  call; archiving toggles via the archive route. */
export const updateSupplementSchema = createSupplementSchema;
export type UpdateSupplementInput = z.infer<typeof updateSupplementSchema>;

/** Query for the list route: `?includeArchived=true` includes archived supplements. */
export const listSupplementsQuerySchema = z.strictObject({
  includeArchived: z.stringbool().default(false),
});
export type ListSupplementsQuery = z.infer<typeof listSupplementsQuerySchema>;

/** Body for the archive toggle route. */
export const archiveSupplementSchema = z.strictObject({
  archived: z.boolean(),
});
export type ArchiveSupplementInput = z.infer<typeof archiveSupplementSchema>;

/** Reorder one time-group: `ids` is the new top-to-bottom order of that group. */
export const reorderSupplementsSchema = z.strictObject({
  timeGroup: supplementTimeGroupSchema,
  ids: z.array(z.cuid()).min(1),
});
export type ReorderSupplementsInput = z.infer<typeof reorderSupplementsSchema>;

/** Check / uncheck a single supplement for a day (defaults to today). */
export const checkSchema = z.strictObject({
  supplementId: z.cuid(),
  day: daySchema.optional(),
});
export type CheckInput = z.infer<typeof checkSchema>;

/** Check / uncheck a whole time-group for a day (defaults to today). */
export const groupCheckSchema = z.strictObject({
  timeGroup: supplementTimeGroupSchema,
  day: daySchema.optional(),
});
export type GroupCheckInput = z.infer<typeof groupCheckSchema>;
