import { z } from "zod";

import {
  hasAnyValue,
  idSchema,
  prioritySchema,
  timezoneSchema,
} from "./common";

const titleSchema = z.string().trim().min(1).max(500);
const descriptionSchema = z.string().max(10_000);
const rruleSchema = z.string().min(1);
const labelIdsSchema = z.array(idSchema).max(50);

export const taskCreateSchema = z
  .strictObject({
    title: titleSchema,
    projectId: idSchema.optional(), // default: Inbox
    sectionId: idSchema.optional(),
    parentId: idSchema.optional(),
    description: descriptionSchema.optional(),
    priority: prioritySchema.optional(),
    dueAt: z.coerce.date().optional(),
    hasDueTime: z.boolean().optional(),
    timezone: timezoneSchema.optional(),
    rrule: rruleSchema.optional(), // storable now; completeTask refuses until phase 6
    recursFromCompletion: z.boolean().optional(),
    labelIds: labelIdsSchema.optional(),
  })
  .refine(
    (v) => !(v.sectionId && v.parentId),
    "sectionId and parentId are mutually exclusive",
  );
export type TaskCreateInput = z.input<typeof taskCreateSchema>;

// Container fields (projectId/sectionId/parentId) and ordering live in
// moveTask; completion lives in completeTask/reopenTask.
export const taskUpdateSchema = z
  .strictObject({
    title: titleSchema.optional(),
    description: descriptionSchema.nullable().optional(),
    priority: prioritySchema.optional(),
    dueAt: z.coerce.date().nullable().optional(),
    hasDueTime: z.boolean().optional(),
    timezone: timezoneSchema.optional(),
    rrule: rruleSchema.nullable().optional(),
    recursFromCompletion: z.boolean().optional(),
    labelIds: labelIdsSchema.optional(), // replaces the full label set
  })
  .refine(hasAnyValue, "empty update");
export type TaskUpdateInput = z.input<typeof taskUpdateSchema>;

export const taskMoveSchema = z
  .strictObject({
    projectId: idSchema.optional(),
    sectionId: idSchema.nullable().optional(), // null = project root
    parentId: idSchema.nullable().optional(), // null = detach to root
    beforeId: idSchema.optional(),
    afterId: idSchema.optional(),
  })
  .refine(hasAnyValue, "empty move")
  .refine(
    (v) => !(v.sectionId && v.parentId),
    "sectionId and parentId are mutually exclusive",
  );
export type TaskMoveInput = z.input<typeof taskMoveSchema>;
