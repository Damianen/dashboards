import { z } from "zod";

// Input for get_spending_summary: an optional civil month (defaults to current).
export const spendingSummarySchema = z.strictObject({
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/, "month as YYYY-MM")
    .optional(),
});
export type SpendingSummaryInput = z.input<typeof spendingSummarySchema>;
