"use server";

import type {
  TaskCreateInput,
  TaskMoveInput,
  TaskUpdateInput,
} from "@/lib/schemas";
import * as tasks from "@/server/services/tasks";

import { toActionResult } from "./result";

// Mutations — thin wrappers; all logic and zod parsing live in the service.

export async function createTaskAction(input: TaskCreateInput) {
  return toActionResult(() => tasks.createTask(input));
}

export async function createTaskFromTextAction(
  text: string,
  base?: tasks.CreateTaskFromTextBase,
) {
  return toActionResult(() => tasks.createTaskFromText(text, base));
}

export async function updateTaskAction(id: string, input: TaskUpdateInput) {
  return toActionResult(() => tasks.updateTask(id, input));
}

export async function moveTaskAction(id: string, input: TaskMoveInput) {
  return toActionResult(() => tasks.moveTask(id, input));
}

export async function completeTaskAction(id: string) {
  return toActionResult(() => tasks.completeTask(id));
}

export async function reopenTaskAction(id: string) {
  return toActionResult(() => tasks.reopenTask(id));
}

export async function deleteTaskAction(id: string) {
  return toActionResult(() => tasks.deleteTask(id));
}

// Read actions — used as TanStack Query queryFns on the client.

/** Today tab payload: overdue group + today's tasks in one round-trip. */
export async function listTodayViewAction() {
  return toActionResult(async () => {
    const [overdue, today] = await Promise.all([
      tasks.listOverdue(),
      tasks.listToday(),
    ]);
    return { overdue, today };
  });
}

export async function listUpcomingAction(days: number) {
  return toActionResult(() => tasks.listUpcoming(days));
}

export async function listProjectViewAction(
  id: string,
  includeCompleted: boolean,
) {
  return toActionResult(() =>
    tasks.listTasksByProject(id, { includeCompleted }),
  );
}

export async function listTasksByLabelAction(id: string) {
  return toActionResult(() => tasks.listTasksByLabel(id));
}

export async function searchTasksAction(q: string) {
  return toActionResult(() => tasks.searchTasks(q));
}

/** Run a Todoist-style filter expression; FILTER_SYNTAX on a bad expression. */
export async function listTasksByFilterAction(filter: string) {
  return toActionResult(() => tasks.listTasksByFilter(filter));
}

/** Fetch a single task with labels — used by the reminder deep link. */
export async function getTaskAction(id: string) {
  return toActionResult(() => tasks.getTask(id));
}
