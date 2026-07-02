import { z } from "zod";

/** A numeric EAN/UPC barcode (6–14 digits). Reused by the product route param. */
export const barcodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6,14}$/, "expected a numeric barcode");

export const searchQuerySchema = z.strictObject({
  q: z.string().trim().min(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});
export type SearchQuery = z.infer<typeof searchQuerySchema>;

// Optional explicit macro values. Kept .optional() (never .default(0)) so an omitted
// field stays undefined (keep the computed value) while an explicit 0 overrides it.
// Max fits the FoodEntry Decimal(7,1)/(6,1) snapshot columns.
const macroOverride = z.number().min(0).max(99999.9).optional();
// Salt snapshots into Decimal(6,2) — a tighter column than the other macros.
const saltOverride = z.number().min(0).max(9999.99).optional();

/**
 * Per-100 g macros for a saved CustomFood. Camel-cased to match the `Macros`
 * interface in src/lib/rules.ts and the JSON keys read back by macrosFromJson —
 * the four energy macros are required, the rest optional. Stored verbatim in the
 * CustomFood.per100g JSON column.
 *
 * The maxes are derived from the FoodEntry snapshot columns: logFood scales
 * per-100g values by quantityG/100 (quantity capped at 5000 g, factor ≤ 50), so
 * each bound × 50 must fit its Decimal column — kcal 9000×50 ≤ Decimal(7,1),
 * gram macros 1000×50 ≤ Decimal(6,1), salt 100×50 ≤ Decimal(6,2), caffeine
 * 19999.9×50 ≤ Decimal(7,1). All are far above any physically plausible food;
 * without them an absurd per-100g value 400s here instead of 500ing at log time.
 */
export const per100gSchema = z.strictObject({
  kcal: z.number().min(0).max(9000),
  proteinG: z.number().min(0).max(1000),
  carbG: z.number().min(0).max(1000),
  fatG: z.number().min(0).max(1000),
  fiberG: z.number().min(0).max(1000).optional(),
  sugarG: z.number().min(0).max(1000).optional(),
  saltG: z.number().min(0).max(100).optional(),
  // Caffeine in MILLIGRAMS per 100 g (every other field is grams). Optional —
  // OFF rarely reports it, and it's hand-entered otherwise. Never enters calorie math.
  caffeineMg: z.number().min(0).max(19999.9).optional(),
});
export type Per100g = z.infer<typeof per100gSchema>;

export const createCustomFoodSchema = z.strictObject({
  name: z.string().trim().min(1),
  brand: z.string().trim().min(1).optional(),
  per100g: per100gSchema,
  // Matches the logFood quantity cap — a serving is something you'd log in one go.
  servingG: z.number().gt(0).max(5000).optional(),
  source: z.enum(["LABEL_SCAN", "MANUAL"]).default("MANUAL"),
});
export type CreateCustomFoodInput = z.infer<typeof createCustomFoodSchema>;

// Editing a saved food: same fields as create minus `source` (a food never changes
// its origin) and `archived` (toggled via the archive route, not an edit). Past diary
// entries snapshot their macros, so an edit never rewrites history.
export const updateCustomFoodSchema = createCustomFoodSchema.omit({ source: true });
export type UpdateCustomFoodInput = z.infer<typeof updateCustomFoodSchema>;

// Archive route body: `archived` defaults true so a bare POST archives; pass
// { archived: false } to restore a food from the "show archived" view.
export const archiveCustomFoodSchema = z.strictObject({
  archived: z.boolean().default(true),
});
export type ArchiveCustomFoodInput = z.infer<typeof archiveCustomFoodSchema>;

export const logFoodSchema = z
  .strictObject({
    barcode: z
      .string()
      .trim()
      .regex(/^\d{6,14}$/, "expected a numeric barcode")
      .optional(),
    customFoodId: z.cuid().optional(),
    customName: z.string().trim().min(1).optional(),
    quantityG: z.number().gt(0).max(5000),
    meal: z.enum(["BREAKFAST", "LUNCH", "DINNER", "SNACK"]).optional(),
    notes: z.string().trim().min(1).optional(),
    eatenAt: z.iso.datetime({ offset: true }).optional(),
    kcal: macroOverride,
    proteinG: macroOverride,
    carbG: macroOverride,
    fatG: macroOverride,
    fiberG: macroOverride,
    sugarG: macroOverride,
    saltG: saltOverride,
    // Caffeine (mg) for THIS entry, already scaled to quantity. Prefilled from the
    // product/custom food when known, always overridable. Snapshotted onto the row.
    caffeineMg: macroOverride,
  })
  .refine(
    (v) =>
      [v.barcode, v.customFoodId, v.customName].filter((x) => x != null)
        .length === 1,
    "provide exactly one of barcode, customFoodId, or customName",
  )
  .refine(
    // Only the free-form customName path needs macros supplied; barcode and
    // customFoodId resolve macros from their source.
    (v) => v.customName == null || v.kcal != null,
    "custom-name entries require kcal",
  );
export type LogFoodInput = z.infer<typeof logFoodSchema>;
