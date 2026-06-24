import { z } from "zod";

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
