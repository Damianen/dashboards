import { z } from "zod";

import { per100gSchema } from "./food";

/**
 * What the vision model returns for a nutrition-label photo. A plain `z.object`
 * (not strict) so a chatty model adding stray keys doesn't fail the parse — the
 * fields we care about are pinned. The label may report values per 100 g, per
 * serving, or both; `normalizeToPer100g` (src/lib/rules.ts) reconciles them.
 * Everything not printed on the label is null — the model never guesses a number.
 */
export const labelScanResultSchema = z.object({
  name: z.string(),
  brand: z.string().nullable(),
  servingSizeG: z.number().nullable(),
  per100g: per100gSchema.nullable(),
  perServing: per100gSchema.nullable(),
  confidence: z.enum(["high", "medium", "low"]),
  notes: z.string(),
});
export type LabelScanResult = z.infer<typeof labelScanResultSchema>;

/**
 * A downscaled image as a data: URL — the one image-input rule, shared by the
 * route bodies below, the MCP tool inputs, and the vision services' own parse
 * (services are the enforcement point, so no caller can skip it).
 */
export const imageDataUrlSchema = z
  .string()
  .startsWith("data:image/", "expected an image data URL");

/** Body for POST /api/food/scan-label: a downscaled image as a data: URL. */
export const scanLabelInputSchema = z.strictObject({
  imageDataUrl: imageDataUrlSchema,
});
export type ScanLabelInput = z.infer<typeof scanLabelInputSchema>;

/**
 * What the vision model returns for a meal/plate photo (the restaurant / no-label
 * fallback). A plain `z.object` (not strict) so a chatty model adding stray keys
 * doesn't fail the parse. Unlike a label these are ROUGH ESTIMATES, not printed
 * truth: each visible component gets a guessed weight and macros, and the model
 * states the assumptions it made plus a one-line caveat. `estimateMeal` recomputes
 * the four totals from the components server-side so they always match the parts.
 */
export const mealEstimateSchema = z.object({
  description: z.string(),
  components: z
    .array(
      z.object({
        name: z.string(),
        estGrams: z.number().min(0),
        kcal: z.number().min(0),
        proteinG: z.number().min(0),
        carbG: z.number().min(0),
        fatG: z.number().min(0),
      }),
    )
    .min(1),
  totalKcal: z.number().min(0),
  totalProteinG: z.number().min(0),
  totalCarbG: z.number().min(0),
  totalFatG: z.number().min(0),
  confidence: z.enum(["low", "medium", "high"]),
  assumptions: z.string(),
  caveat: z.string(),
});
export type MealEstimate = z.infer<typeof mealEstimateSchema>;

/** Body for POST /api/food/estimate-meal: a downscaled image as a data: URL. */
export const estimateMealInputSchema = z.strictObject({
  imageDataUrl: imageDataUrlSchema,
});
export type EstimateMealInput = z.infer<typeof estimateMealInputSchema>;
