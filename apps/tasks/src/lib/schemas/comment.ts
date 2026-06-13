import { z } from "zod";

import { idSchema } from "./common";

const bodySchema = z.string().trim().min(1).max(10_000);

// Structural XOR: a comment targets exactly one of task or project (the DB
// enforces the same with a CHECK constraint).
export const commentCreateSchema = z.union([
  z.strictObject({ body: bodySchema, taskId: idSchema }),
  z.strictObject({ body: bodySchema, projectId: idSchema }),
]);
export type CommentCreateInput = z.input<typeof commentCreateSchema>;
