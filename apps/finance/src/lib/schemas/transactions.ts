import { z } from "zod";

import { idSchema } from "./common";

// Read-only transaction search. Single source of truth for the service AND the
// MCP search_transactions tool. Amounts are signed strings (bank convention);
// dates are civil YYYY-MM-DD. `limit` is capped so an agent can't pull the world.

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "date as YYYY-MM-DD");

const amountSchema = z
  .string()
  .trim()
  .regex(/^-?\d+(\.\d{1,2})?$/, "signed amount with up to 2 decimals");

export const transactionSearchSchema = z.strictObject({
  query: z.string().trim().min(1).max(200).optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  categoryId: idSchema.optional(),
  minAmount: amountSchema.optional(),
  maxAmount: amountSchema.optional(),
  includeInternal: z.boolean().optional().default(false),
  limit: z.number().int().min(1).max(100).optional().default(50),
});
export type TransactionSearchInput = z.input<typeof transactionSearchSchema>;
