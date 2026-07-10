import { z } from "zod";

/**
 * The protein-target factor in grams per kg of bodyweight. Single source of truth for the
 * PATCH /api/settings/protein body. Bounded 0.1–10 g/kg — wide enough for any real diet,
 * tight enough to reject a fat-fingered value. Coerced so a form string ("2.0") parses.
 */
export const proteinSettingSchema = z.strictObject({
  gPerKg: z.coerce.number().min(0.1).max(10),
});
export type ProteinSetting = z.infer<typeof proteinSettingSchema>;

/**
 * Goal body weight in kg. Single source of truth for the PATCH /api/settings/weight-goal
 * body. Bounded 20–500 kg — wide enough for any adult, tight enough to reject a typo.
 * Coerced so a form string ("75") parses.
 */
export const weightGoalSchema = z.strictObject({
  goalKg: z.coerce.number().min(20).max(500),
});
export type WeightGoalSetting = z.infer<typeof weightGoalSchema>;

/**
 * Daily intake calorie target (an intake-ONLY goal — never an expenditure/deficit
 * figure, per the no-net-calories guardrail). Single source of truth for the PATCH
 * /api/settings/intake-target body. Bounded 500–10000 kcal. Coerced for form strings.
 */
export const intakeTargetSchema = z.strictObject({
  kcal: z.coerce.number().int().min(500).max(10000),
});
export type IntakeTargetSetting = z.infer<typeof intakeTargetSchema>;

/**
 * The two water-target inputs (the formula itself lives ONLY in the daily_summary
 * view: base + Σ stimulant mg × mlPerMg). Single source of truth for the PATCH
 * /api/settings/water body. baseTargetMl 500–6000 brackets any sane base;
 * mlPerMgStimulant 0–5 brackets the 1.0 default, with 0 disabling the caffeine
 * adjustment entirely. Coerced so form strings parse.
 */
export const waterSettingsSchema = z.strictObject({
  baseTargetMl: z.coerce.number().int().min(500).max(6000),
  mlPerMgStimulant: z.coerce.number().min(0).max(5),
});
export type WaterSettings = z.infer<typeof waterSettingsSchema>;

/**
 * Goal-feature knobs, one JSON settings row ("goals.settings"). Single source
 * of truth for the PATCH /api/settings/goals body. Rate caps are % bodyweight
 * per WEEK, bounded to physiologically sane ranges (the defaults 0.75 loss /
 * 0.5 gain are already aggressive). The 25%-deficit / 20%-surplus TDEE bounds
 * are fixed constants in lib/goals, deliberately NOT settings. Per-phase
 * protein factors feed the adherence target while a goal is ACTIVE. Coerced so
 * form strings parse.
 */
export const goalSettingsSchema = z.strictObject({
  maxLossPctBwPerWeek: z.coerce.number().min(0.1).max(1.0),
  maxGainPctBwPerWeek: z.coerce.number().min(0.1).max(0.75),
  floorKcal: z.coerce.number().int().min(1200).max(3000),
  adjustmentCapKcal: z.coerce.number().int().min(50).max(500),
  autoApplyCheckIns: z.boolean(),
  proteinGPerKg: z.strictObject({
    cut: z.coerce.number().min(0.1).max(10),
    maintain: z.coerce.number().min(0.1).max(10),
    bulk: z.coerce.number().min(0.1).max(10),
  }),
});
export type GoalSettings = z.infer<typeof goalSettingsSchema>;
