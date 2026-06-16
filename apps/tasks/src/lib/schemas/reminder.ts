import { z } from "zod";

import { idSchema } from "./common";

// 0 = at the due time; otherwise N minutes before. Capped at 4 weeks.
const minutesBeforeSchema = z.number().int().min(0).max(40_320);
const absoluteAtSchema = z.coerce.date();

// Structural XOR: a reminder is either relative to the task's due time
// (minutesBefore) or pinned to a fixed instant (absoluteAt), never both.
export const reminderCreateSchema = z.union([
  z.strictObject({ taskId: idSchema, minutesBefore: minutesBeforeSchema }),
  z.strictObject({ taskId: idSchema, absoluteAt: absoluteAtSchema }),
]);
export type ReminderCreateInput = z.input<typeof reminderCreateSchema>;

export const reminderUpdateSchema = z.union([
  z.strictObject({ minutesBefore: minutesBeforeSchema }),
  z.strictObject({ absoluteAt: absoluteAtSchema }),
]);
export type ReminderUpdateInput = z.input<typeof reminderUpdateSchema>;
