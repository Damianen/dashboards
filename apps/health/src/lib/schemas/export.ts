import { z } from "zod";

import { daySchema } from "./common";

/**
 * Every exportable domain — the app's whole user-data surface. Auth, push and
 * notification bookkeeping (OauthToken, PushSubscription, Notified*) and
 * SyncRun are deliberately NOT domains: exports must never carry secrets or
 * operational state.
 */
export const exportDomainSchema = z.enum([
  "weight",
  "sleep",
  "readiness",
  "activity",
  "workouts",
  "food",
  "food_products",
  "custom_foods",
  "meals",
  "daily_plans",
  "water",
  "stimulants",
  "supplements",
  "lifting",
  "templates",
  "settings",
]);
export type ExportDomain = z.infer<typeof exportDomainSchema>;

/**
 * Domains whose rows carry a `day` column and accept a from/to range (for the
 * grouped ones the range hits the logged rows; their catalog halves ride along
 * whole). The other six are catalogs and always export whole.
 */
export const TIME_SERIES_DOMAINS: ReadonlySet<ExportDomain> = new Set<ExportDomain>([
  "weight",
  "sleep",
  "readiness",
  "activity",
  "workouts",
  "food",
  "water",
  "stimulants",
  "supplements",
  "lifting",
]);

/**
 * Query for GET /api/export. `domains` is a comma-separated list (default: all
 * of them); `include_raw` follows the app's query-string boolean convention
 * (z.stringbool, like `includeArchived` elsewhere) and defaults to true — the
 * web route is the full-fidelity backup path.
 */
export const exportQuerySchema = z
  .strictObject({
    domains: z
      .string()
      .default(exportDomainSchema.options.join(","))
      .transform((s) => [
        ...new Set(s.split(",").map((d) => d.trim()).filter(Boolean)),
      ])
      .pipe(z.array(exportDomainSchema).min(1)),
    from: daySchema.optional(),
    to: daySchema.optional(),
    include_raw: z.stringbool().default(true),
  })
  .refine((q) => q.from == null || q.to == null || q.from <= q.to, {
    message: "`from` must not be after `to`",
    path: ["from"],
  });
export type ExportQuery = z.infer<typeof exportQuerySchema>;
