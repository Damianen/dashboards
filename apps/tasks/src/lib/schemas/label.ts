import { z } from "zod";

import { colorSchema, hasAnyValue } from "./common";

const nameSchema = z.string().trim().min(1).max(60);

export const labelCreateSchema = z.strictObject({
  name: nameSchema,
  color: colorSchema.optional(),
});
export type LabelCreateInput = z.input<typeof labelCreateSchema>;

export const labelUpdateSchema = z
  .strictObject({
    name: nameSchema.optional(),
    color: colorSchema.optional(),
  })
  .refine(hasAnyValue, "empty update");
export type LabelUpdateInput = z.input<typeof labelUpdateSchema>;
