import { z } from "zod";

export const trendMetricSchema = z.enum([
  "weight",
  "weight_7d_avg",
  "sleep_score",
  "readiness",
  "active_kcal",
  "steps",
  "intake_kcal",
  "protein_g",
  "water_ml",
  "water_target_ml",
  "caffeine_mg",
  "lifting_volume_kg",
]);
export type TrendMetric = z.infer<typeof trendMetricSchema>;

export const trendsQuerySchema = z.strictObject({
  metric: trendMetricSchema,
  days: z.coerce.number().int().min(1).max(365).default(30),
});
export type TrendsQuery = z.infer<typeof trendsQuerySchema>;
