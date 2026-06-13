import { z } from "zod";

import { hasAnyValue } from "./common";

const nameSchema = z.string().trim().min(1).max(200);

export const projectCreateSchema = z.strictObject({
  name: nameSchema,
});
export type ProjectCreateInput = z.input<typeof projectCreateSchema>;

export const projectUpdateSchema = z
  .strictObject({
    name: nameSchema.optional(),
  })
  .refine(hasAnyValue, "empty update");
export type ProjectUpdateInput = z.input<typeof projectUpdateSchema>;
