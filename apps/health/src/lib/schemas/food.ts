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
const macroOverride = z.number().min(0).max(99999.9).optional();

export const logFoodSchema = z
  .strictObject({
    barcode: z
      .string()
      .trim()
      .regex(/^\d{6,14}$/, "expected a numeric barcode")
      .optional(),
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
    saltG: macroOverride,
  })
  .refine(
    (v) => (v.barcode == null) !== (v.customName == null),
    "provide exactly one of barcode or customName",
  )
  .refine(
    (v) => v.barcode != null || v.kcal != null,
    "custom entries require kcal",
  );
export type LogFoodInput = z.infer<typeof logFoodSchema>;
