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
  "total_sleep_min",
  "deep_min",
  "rem_min",
  "hrv_ms",
  "resting_hr_bpm",
  "body_fat_pct",
  "muscle_mass_kg",
  "fiber_g",
]);
export type TrendMetric = z.infer<typeof trendMetricSchema>;

export const trendsQuerySchema = z.strictObject({
  metric: trendMetricSchema,
  days: z.coerce.number().int().min(1).max(365).default(30),
});
export type TrendsQuery = z.infer<typeof trendsQuerySchema>;
