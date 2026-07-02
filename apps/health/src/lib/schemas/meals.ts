import { z } from "zod";

import { MEAL_ORDER } from "@/lib/food";

import { barcodeSchema } from "./food";

// A macro value as entered for a free-typed meal item — same bounds as food's macroOverride.
const macroValue = z.number().min(0).max(99999.9);

/**
 * One ingredient of a recipe. Exactly one source is set, mirroring logFoodSchema and
 * adding a nested-meal source. barcode/customFoodId items scale by quantityG; a
 * free-typed customName item carries its own absolute macros (kcal required, the rest
 * optional); a childMealId item folds the sub-meal's per-portion macros × childPortions.
 */
export const mealItemSchema = z
  .strictObject({
    barcode: barcodeSchema.optional(),
    customFoodId: z.cuid().optional(),
    customName: z.string().trim().min(1).optional(),
    childMealId: z.cuid().optional(),
    quantityG: z.number().gt(0).max(5000).optional(),
    childPortions: z.number().gt(0).max(9999).optional(),
    kcal: macroValue.optional(),
    proteinG: macroValue.optional(),
    carbG: macroValue.optional(),
    fatG: macroValue.optional(),
    fiberG: macroValue.optional(),
    sugarG: macroValue.optional(),
    saltG: macroValue.optional(),
    // Caffeine (mg) for a free-typed item; barcode/customFood/childMeal items inherit
    // caffeine from their source. Folds into the meal's per-portion caffeine snapshot.
    caffeineMg: macroValue.optional(),
  })
  .refine(
    (v) =>
      [v.barcode, v.customFoodId, v.customName, v.childMealId].filter(
        (x) => x != null,
      ).length === 1,
    "provide exactly one of barcode, customFoodId, customName, or childMealId",
  )
  .refine(
    // OFF products and saved custom foods are per-100 g, so they need a gram quantity.
    (v) => (v.barcode == null && v.customFoodId == null) || v.quantityG != null,
    "barcode and customFoodId items require quantityG",
  )
  .refine(
    // Free-typed items carry their own macros; kcal is the minimum (like logFoodSchema).
    (v) => v.customName == null || v.kcal != null,
    "custom-name items require kcal",
  )
  .refine(
    (v) => v.childMealId == null || v.childPortions != null,
    "nested-meal items require childPortions",
  );
export type MealItemInput = z.infer<typeof mealItemSchema>;

export const createMealSchema = z.strictObject({
  name: z.string().trim().min(1),
  notes: z.string().trim().min(1).optional(),
  yieldPortions: z.number().gt(0).max(9999.99),
  items: z.array(mealItemSchema).min(1),
});
export type CreateMealInput = z.infer<typeof createMealSchema>;

/** Updating a meal fully replaces its editable fields and item list (then the
 *  service re-resolves and re-snapshots the per-portion macros). */
export const updateMealSchema = createMealSchema;
export type UpdateMealInput = CreateMealInput;

export const logMealSchema = z.strictObject({
  mealId: z.cuid(),
  portions: z.number().gt(0).max(9999),
  meal: z.enum(MEAL_ORDER).optional(),
  eatenAt: z.iso.datetime({ offset: true }).optional(),
});
export type LogMealInput = z.infer<typeof logMealSchema>;
