import { z } from "zod";

/**
 * The observations rolling window, in days. 14–180 — long enough for a pattern to form,
 * capped so a query can't scan unbounded history. Single source of truth reused by the
 * route query and the MCP tool input.
 */
export const observationsWindowSchema = z.coerce.number().int().min(14).max(180);
export type ObservationsWindow = z.infer<typeof observationsWindowSchema>;

/** GET /api/insights/observations query: optional window (defaults to 30). */
export const observationsQuerySchema = z.strictObject({
  window: observationsWindowSchema.default(30),
});
export type ObservationsQuery = z.infer<typeof observationsQuerySchema>;

/**
 * The empirical-TDEE rolling window, in days. A small fixed set (not a free range):
 * shorter windows react faster but are noisier; 14 is the default. Single source of
 * truth reused by the route query, the MCP tool input, and the settings write.
 */
export const tdeeWindowSchema = z.union([
  z.literal(14),
  z.literal(21),
  z.literal(28),
]);
export type TdeeWindow = z.infer<typeof tdeeWindowSchema>;

/** GET /api/insights/tdee query: optional window override (else the stored default). */
export const tdeeQuerySchema = z.strictObject({
  window: z.coerce.number().pipe(tdeeWindowSchema).optional(),
});
export type TdeeQuery = z.infer<typeof tdeeQuerySchema>;

/** PATCH /api/insights/tdee body: persist the default window. */
export const setTdeeWindowSchema = z.strictObject({
  windowDays: tdeeWindowSchema,
});
export type SetTdeeWindowInput = z.infer<typeof setTdeeWindowSchema>;
