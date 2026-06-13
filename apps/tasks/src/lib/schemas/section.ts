import { z } from "zod";

import { idSchema } from "./common";

const nameSchema = z.string().trim().min(1).max(200);

export const sectionCreateSchema = z.strictObject({
  projectId: idSchema,
  name: nameSchema,
});
export type SectionCreateInput = z.input<typeof sectionCreateSchema>;

export const sectionUpdateSchema = z.strictObject({
  name: nameSchema,
});
export type SectionUpdateInput = z.input<typeof sectionUpdateSchema>;
