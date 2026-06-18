import { z } from "zod";

/**
 * A civil date string ("YYYY-MM-DD", Europe/Amsterdam) as produced by dayOf().
 * Used by GET route handlers to validate the `?day=` query param.
 */
export const daySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD")
  .refine(
    (d) => !Number.isNaN(new Date(`${d}T00:00:00.000Z`).getTime()),
    "not a valid calendar date",
  );
export type Day = z.infer<typeof daySchema>;
