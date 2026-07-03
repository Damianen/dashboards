import { z } from "zod";

/** Which briefing to compose: morning plans the day, evening recaps + plans tomorrow. */
export const briefingModeSchema = z.enum(["morning", "evening"]);
export type BriefingMode = z.infer<typeof briefingModeSchema>;

/** One slot in the workout rotation: a template to perform, or a planned rest day. */
export const rotationEntrySchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("TEMPLATE"), templateId: z.cuid() }),
  z.strictObject({ kind: z.literal("REST") }),
]);
export type RotationEntry = z.infer<typeof rotationEntrySchema>;

/**
 * The ordered rotation. Single source of truth for the PATCH /api/settings/rotation
 * body AND the `workout.rotation` setting value. Max 14 entries brackets any sane
 * split (up to a two-week cycle); empty = no rotation configured.
 */
export const rotationSchema = z.strictObject({
  entries: z.array(rotationEntrySchema).max(14),
});
export type RotationInput = z.infer<typeof rotationSchema>;

/** Wall-clock send time, zero-padded 24h "HH:MM" — compares lexicographically. */
const slotTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "expected HH:MM (24h)");

/** One notification slot: whether it fires and at what Amsterdam wall-clock time. */
const briefingSlotSchema = z.strictObject({
  enabled: z.boolean(),
  time: slotTimeSchema,
});
export type BriefingSlot = z.infer<typeof briefingSlotSchema>;

/**
 * Readiness-score bands for the session suggestion (used only when the recovery
 * engine has an insufficient baseline): >= goodMin → good, >= moderateMin →
 * moderate, below → poor.
 */
const suggestionThresholdsSchema = z
  .strictObject({
    goodMin: z.coerce.number().int().min(1).max(100),
    moderateMin: z.coerce.number().int().min(1).max(100),
  })
  .refine((t) => t.moderateMin < t.goodMin, {
    message: "moderateMin must be below goodMin",
    path: ["moderateMin"],
  });
export type SuggestionThresholds = z.infer<typeof suggestionThresholdsSchema>;

/**
 * All briefing settings. Single source of truth for the PATCH
 * /api/settings/briefing body; persisted across three Setting rows
 * (schedule / mode cutoff / thresholds). `modeCutoffHour` splits the day:
 * before it the briefing defaults to morning mode, from it onward evening.
 */
export const briefingSettingsSchema = z.strictObject({
  morning: briefingSlotSchema,
  evening: briefingSlotSchema,
  modeCutoffHour: z.coerce.number().int().min(0).max(23),
  thresholds: suggestionThresholdsSchema,
});
export type BriefingSettings = z.infer<typeof briefingSettingsSchema>;
