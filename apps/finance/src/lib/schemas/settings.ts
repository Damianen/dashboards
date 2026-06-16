import { z } from "zod";

// Large-transaction alert threshold (EUR), as a string parsed to Decimal.
export const settingUpdateSchema = z.strictObject({
  largeTxnThreshold: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,2})?$/, "amount with up to 2 decimals")
    .refine((v) => Number(v) > 0, "must be greater than 0")
    .refine((v) => Number(v) <= 1_000_000, "too large"),
});
export type SettingUpdateInput = z.input<typeof settingUpdateSchema>;
