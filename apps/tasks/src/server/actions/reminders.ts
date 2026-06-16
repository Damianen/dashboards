"use server";

import type { ReminderCreateInput, ReminderUpdateInput } from "@/lib/schemas";
import * as reminders from "@/server/services/reminders";

import { toActionResult } from "./result";

// Thin wrappers — all logic and zod parsing live in the reminders service.

export async function createReminderAction(input: ReminderCreateInput) {
  return toActionResult(() => reminders.createReminder(input));
}

export async function listRemindersAction(taskId: string) {
  return toActionResult(() => reminders.listReminders(taskId));
}

export async function updateReminderAction(
  id: string,
  input: ReminderUpdateInput,
) {
  return toActionResult(() => reminders.updateReminder(id, input));
}

export async function deleteReminderAction(id: string) {
  return toActionResult(() => reminders.deleteReminder(id));
}
