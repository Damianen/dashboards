import type { Reminder, Task } from "@/generated/prisma/client";
import { sendTaskReminder } from "@/lib/ntfy";
import {
  reminderCreateSchema,
  reminderUpdateSchema,
  type ReminderCreateInput,
  type ReminderUpdateInput,
} from "@/lib/schemas";
import { prisma } from "@/server/db";

import { logEvent } from "./activity";
import { NotFoundError } from "./errors";

export async function createReminder(
  input: ReminderCreateInput,
): Promise<Reminder> {
  const data = reminderCreateSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    const task = await tx.task.findUnique({ where: { id: data.taskId } });
    if (!task) throw new NotFoundError("task", data.taskId);
    const reminder = await tx.reminder.create({ data });
    await logEvent(tx, "reminder", reminder.id, "reminder.created", {
      taskId: data.taskId,
    });
    return reminder;
  });
}

export async function listReminders(taskId: string): Promise<Reminder[]> {
  return prisma.reminder.findMany({
    where: { taskId },
    orderBy: { createdAt: "asc" },
  });
}

export async function updateReminder(
  id: string,
  input: ReminderUpdateInput,
): Promise<Reminder> {
  const data = reminderUpdateSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    const existing = await tx.reminder.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("reminder", id);
    // Switching timing mode clears the other field and re-arms the reminder.
    const patch =
      "minutesBefore" in data
        ? { minutesBefore: data.minutesBefore, absoluteAt: null, lastFiredFor: null }
        : { absoluteAt: data.absoluteAt, minutesBefore: null, lastFiredFor: null };
    const updated = await tx.reminder.update({ where: { id }, data: patch });
    await logEvent(tx, "reminder", id, "reminder.updated");
    return updated;
  });
}

export async function deleteReminder(id: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.reminder.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("reminder", id);
    await logEvent(tx, "reminder", id, "reminder.deleted", {
      taskId: existing.taskId,
    });
    await tx.reminder.delete({ where: { id } });
  });
}

/** When a reminder should fire, or null if it can't be computed (e.g. a
 *  relative reminder on a task with no due date). */
function effectiveTime(reminder: Reminder, task: Task): Date | null {
  if (reminder.absoluteAt !== null) return reminder.absoluteAt;
  if (reminder.minutesBefore !== null && task.dueAt !== null)
    return new Date(task.dueAt.getTime() - reminder.minutesBefore * 60_000);
  return null;
}

function sameInstant(a: Date | null, b: Date | null): boolean {
  if (a === null || b === null) return a === b;
  return a.getTime() === b.getTime();
}

/**
 * Worker tick: push every reminder whose effective time has passed and that
 * hasn't already fired for the current occurrence. Relative reminders dedupe on
 * the task's dueAt (so they re-arm when a recurring task advances); absolute
 * reminders dedupe on their own instant (one-shot). Returns how many fired.
 */
export async function fireDueReminders(now: Date): Promise<number> {
  const reminders = await prisma.reminder.findMany({
    where: { task: { completedAt: null } },
    include: { task: true },
  });

  let fired = 0;
  for (const reminder of reminders) {
    const effective = effectiveTime(reminder, reminder.task);
    if (effective === null || effective.getTime() > now.getTime()) continue;
    const fireKey =
      reminder.absoluteAt !== null ? reminder.absoluteAt : reminder.task.dueAt;
    if (sameInstant(reminder.lastFiredFor, fireKey)) continue;

    await sendTaskReminder(reminder.task);
    await prisma.reminder.update({
      where: { id: reminder.id },
      data: { lastFiredFor: fireKey },
    });
    fired++;
  }
  return fired;
}
