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
