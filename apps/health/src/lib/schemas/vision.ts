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

/** Body for POST /api/food/scan-label: a downscaled image as a data: URL. */
export const scanLabelInputSchema = z.strictObject({
  imageDataUrl: z.string().startsWith("data:image/", "expected an image data URL"),
});
export type ScanLabelInput = z.infer<typeof scanLabelInputSchema>;
