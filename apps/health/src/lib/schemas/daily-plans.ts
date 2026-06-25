import { z } from "zod";

import { daySchema } from "./common";
import { barcodeSchema } from "./food";

/**
 * One item of a daily plan. Exactly one source is set (enforced here + in the
 * service), mirroring how a FoodEntry resolves: an OFF product or a saved custom
 * food (scaled by quantityG), or a saved meal (scaled by portions). Unlike a
 * MealItem there is NO free-typed source and NO stored macros — a plan item is a
 * pure reference that `applyDailyPlan` re-resolves through logFood/logMeal. The
 * optional mealSlot is the diary slot the applied entry should land in.
 */
export const dailyPlanItemSchema = z
  .strictObject({
    barcode: barcodeSchema.optional(),
    customFoodId: z.cuid().optional(),
    mealId: z.cuid().optional(),
    quantityG: z.number().gt(0).max(5000).optional(),
    portions: z.number().gt(0).max(9999).optional(),
    mealSlot: z.enum(["BREAKFAST", "LUNCH", "DINNER", "SNACK"]).optional(),
  })
  .refine(
    (v) =>
      [v.barcode, v.customFoodId, v.mealId].filter((x) => x != null).length ===
      1,
    "provide exactly one of barcode, customFoodId, or mealId",
  )
  .refine(
    // OFF products and saved custom foods are per-100 g, so they need a gram quantity.
    (v) => (v.barcode == null && v.customFoodId == null) || v.quantityG != null,
    "barcode and customFoodId items require quantityG",
  )
  .refine(
    // A meal is logged by portion count, like logMeal.
    (v) => v.mealId == null || v.portions != null,
    "meal items require portions",
  );
export type DailyPlanItemInput = z.infer<typeof dailyPlanItemSchema>;

export const createDailyPlanSchema = z.strictObject({
  name: z.string().trim().min(1),
  notes: z.string().trim().min(1).optional(),
  items: z.array(dailyPlanItemSchema).min(1),
});
export type CreateDailyPlanInput = z.infer<typeof createDailyPlanSchema>;

/** Updating a plan fully replaces its editable fields and item list. */
export const updateDailyPlanSchema = createDailyPlanSchema;
export type UpdateDailyPlanInput = CreateDailyPlanInput;

/**
 * Apply a plan onto a day's diary. `day` is optional here and defaults to today
 * at the call site (route handler / MCP tool), matching how the water route
 * defaults its `?day=` param — keeps "today" evaluated per request, never frozen
 * at module load.
 */
export const applyDailyPlanSchema = z.strictObject({
  dailyPlanId: z.cuid(),
  day: daySchema.optional(),
});
export type ApplyDailyPlanInput = z.infer<typeof applyDailyPlanSchema>;
