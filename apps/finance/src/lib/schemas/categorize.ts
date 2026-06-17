import { z } from "zod";

import { RuleField, RuleMatch } from "@/generated/prisma/client";

import { cursorSchema, idSchema } from "./common";

// Rule field/match enums mirror the Prisma enums exactly (single source of
// truth) so a rule's stored value is always a valid RuleField / RuleMatch.
export const ruleFieldSchema = z.enum(
  Object.values(RuleField) as [string, ...string[]],
);
export const ruleMatchSchema = z.enum(
  Object.values(RuleMatch) as [string, ...string[]],
);

/** Manually assign a category to one transaction; optionally create a rule. */
export const categorizeSchema = z.strictObject({
  transactionId: idSchema,
  categoryId: idSchema,
  createRule: z.boolean().optional().default(false),
});
export type CategorizeInput = z.input<typeof categorizeSchema>;

/** Create a CategoryRule. Used directly and when "also create a rule" is on. */
export const ruleCreateSchema = z.strictObject({
  categoryId: idSchema,
  field: ruleFieldSchema,
  match: ruleMatchSchema,
  value: z.string().trim().min(1).max(200),
  priority: z.number().int().min(0).max(10_000).optional().default(100),
});
export type RuleCreateInput = z.input<typeof ruleCreateSchema>;

/** Query params for the inbox list route. */
export const inboxQuerySchema = z.strictObject({
  cursor: cursorSchema.nullish(),
});
