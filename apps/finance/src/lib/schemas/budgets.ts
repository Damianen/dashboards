import { z } from "zod";

import { idSchema } from "./common";

// Money as a string the service parses to Decimal(12,2) — no float drift, and a
// clean match for the storage type. Positive, up to two decimals, sane cap.
const limitSchema = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,2})?$/, "amount with up to 2 decimals")
  .refine((v) => Number(v) > 0, "must be greater than 0")
  .refine((v) => Number(v) <= 1_000_000, "too large");

export const budgetUpsertSchema = z.strictObject({
  categoryId: idSchema,
  limit: limitSchema,
});
export type BudgetUpsertInput = z.input<typeof budgetUpsertSchema>;

export const budgetDeleteSchema = z.strictObject({
  id: idSchema,
});
export type BudgetDeleteInput = z.input<typeof budgetDeleteSchema>;
