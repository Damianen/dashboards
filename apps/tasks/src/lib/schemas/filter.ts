import { z } from "zod";

import { colorSchema, hasAnyValue } from "./common";

const nameSchema = z.string().trim().min(1).max(60);
const querySchema = z.string().trim().min(1).max(500);

// Note: the query's *syntax* is validated in the service (via compileFilter),
// not here — that keeps this schema, which the MCP layer also imports, free of
// the chrono-bearing filter module.
export const savedFilterCreateSchema = z.strictObject({
  name: nameSchema,
  query: querySchema,
  color: colorSchema.optional(),
});
export type SavedFilterCreateInput = z.input<typeof savedFilterCreateSchema>;

export const savedFilterUpdateSchema = z
  .strictObject({
    name: nameSchema.optional(),
    query: querySchema.optional(),
    color: colorSchema.optional(),
  })
  .refine(hasAnyValue, "empty update");
export type SavedFilterUpdateInput = z.input<typeof savedFilterUpdateSchema>;
