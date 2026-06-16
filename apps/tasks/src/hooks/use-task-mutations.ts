"use client";

import {
  useMutation,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";

import { qk } from "@/lib/query-keys";
import {
  applyOpToFlatList,
  applyOpToLabelView,
  applyOpToProjectView,
  applyOpToTodayView,
  collectSubtreeIds,
  type TaskCacheOp,
} from "@/lib/task-cache";
import { useToast } from "@/components/providers/toast-provider";
import { unwrap } from "@/server/actions/result";
import {
  completeTaskAction,
  createTaskAction,
  createTaskFromTextAction,
  deleteTaskAction,
  moveTaskAction,
  reopenTaskAction,
  updateTaskAction,
} from "@/server/actions/tasks";
import type { CreateTaskFromTextBase } from "@/server/services/tasks";
import type { Label } from "@/generated/prisma/client";
import type {
  LabelTasksView,
  ProjectTasksView,
  TaskWithLabels,
} from "@/server/services/tasks";
import type {
  TaskCreateInput,
  TaskMoveInput,
} from "@/lib/schemas";

import type { TodayView } from "./use-task-queries";

type Op = TaskCacheOp<TaskWithLabels>;

/** Dispatch one op against a single cache entry, keyed by its query shape. */
function applyOpToEntry(key: readonly unknown[], data: unknown, op: Op): unknown {
  switch (key[1]) {
    case "today":
      return applyOpToTodayView(data as TodayView, op);
    case "upcoming":
    case "search":
    case "filter":
      return applyOpToFlatList(data as TaskWithLabels[], op);
    case "label":
      return applyOpToLabelView(data as LabelTasksView, op);
    case "project": {
      const meta = key[3] as { includeCompleted: boolean } | undefined;
      return applyOpToProjectView(
        data as ProjectTasksView,
        op,
        meta?.includeCompleted ?? false,
      );
    }
    default:
      return data;
  }
}

/**
 * Find the task plus its descendants from any cached project tree, so a
 * complete/delete/move optimistically cascades. Falls back to the lone id
 * when no tree holds it (the date/label/search views are flat).
 */
function gatherSubtreeIds(qc: QueryClient, id: string): string[] {
  const entries = qc.getQueriesData<ProjectTasksView>({
    queryKey: qk.projectPrefix,
  });
  for (const [, view] of entries) {
    if (!view) continue;
    const forest = [...view.rootTasks, ...view.sections.flatMap((s) => s.tasks)];
    const ids = collectSubtreeIds(forest, id);
    if (ids.length > 0) return ids;
  }
  return [id];
}

interface TaskMutationConfig<TVars> {
  mutationFn: (vars: TVars) => Promise<unknown>;
  toCacheOps: (vars: TVars, qc: QueryClient) => Op[];
  errorMessage: string;
}

/**
 * Shared optimistic engine for every task mutation. Snapshots all ["tasks"]
 * caches, applies the ops per cache shape, rolls back + toasts on error, and
 * reconciles via invalidation on settle (also refreshing project counts).
 */
function useTaskMutation<TVars>({
  mutationFn,
  toCacheOps,
  errorMessage,
}: TaskMutationConfig<TVars>) {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn,
    onMutate: async (vars: TVars) => {
      await qc.cancelQueries({ queryKey: qk.tasks });
      const snapshots = qc.getQueriesData({ queryKey: qk.tasks });
      const ops = toCacheOps(vars, qc);
      for (const [key, data] of snapshots) {
        if (data === undefined) continue;
        let next: unknown = data;
        for (const op of ops) {
          next = applyOpToEntry(key as readonly unknown[], next, op);
        }
        qc.setQueryData(key, next);
      }
      return { snapshots };
    },
    onError: (_err, _vars, context) => {
      if (context) {
        for (const [key, data] of context.snapshots) qc.setQueryData(key, data);
      }
      toast({ message: errorMessage, variant: "error" });
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: qk.tasks });
      void qc.invalidateQueries({ queryKey: qk.projectTree });
    },
  });
}

export function useCompleteTask() {
  return useTaskMutation<string>({
    mutationFn: async (id) => unwrap(await completeTaskAction(id)),
    toCacheOps: (id, qc) => [
      { kind: "complete", ids: gatherSubtreeIds(qc, id), completedAt: new Date() },
    ],
    errorMessage: "Couldn't complete task",
  });
}

export function useReopenTask() {
  return useTaskMutation<string>({
    mutationFn: async (id) => unwrap(await reopenTaskAction(id)),
    toCacheOps: (id) => [{ kind: "reopen", id }],
    errorMessage: "Couldn't reopen task",
  });
}

/** Optimistic-friendly subset of the update input (dueAt already a Date). */
export interface TaskEdit {
  title?: string;
  description?: string | null;
  priority?: number;
  dueAt?: Date | null;
  hasDueTime?: boolean;
  timezone?: string;
  labelIds?: string[];
  rrule?: string | null;
  recursFromCompletion?: boolean;
}

export interface UpdateTaskVars {
  id: string;
  edit: TaskEdit;
}

function buildTaskPatch(
  edit: TaskEdit,
  qc: QueryClient,
): Partial<TaskWithLabels> {
  const patch: Partial<TaskWithLabels> = {};
  if (edit.title !== undefined) patch.title = edit.title;
  if (edit.description !== undefined) patch.description = edit.description;
  if (edit.priority !== undefined) patch.priority = edit.priority;
  if (edit.dueAt !== undefined) patch.dueAt = edit.dueAt;
  if (edit.hasDueTime !== undefined) patch.hasDueTime = edit.hasDueTime;
  if (edit.timezone !== undefined) patch.timezone = edit.timezone;
  if (edit.rrule !== undefined) patch.rrule = edit.rrule;
  if (edit.recursFromCompletion !== undefined)
    patch.recursFromCompletion = edit.recursFromCompletion;
  if (edit.labelIds !== undefined) {
    const labels = qc.getQueryData<Label[]>(qk.labels) ?? [];
    const byId = new Map(labels.map((l) => [l.id, l]));
    patch.labels = edit.labelIds
      .map((labelId) => byId.get(labelId))
      .filter((l): l is Label => l !== undefined);
  }
  return patch;
}

export function useUpdateTask() {
  return useTaskMutation<UpdateTaskVars>({
    mutationFn: async ({ id, edit }) => unwrap(await updateTaskAction(id, edit)),
    toCacheOps: ({ id, edit }, qc) => [
      { kind: "patch", id, patch: buildTaskPatch(edit, qc) },
    ],
    errorMessage: "Couldn't save changes",
  });
}

export interface MoveTaskVars {
  id: string;
  input: TaskMoveInput;
}

export function useMoveTask() {
  return useTaskMutation<MoveTaskVars>({
    mutationFn: async ({ id, input }) => unwrap(await moveTaskAction(id, input)),
    toCacheOps: ({ id, input }, qc) => {
      const patch: Partial<TaskWithLabels> = {};
      if (input.projectId !== undefined) patch.projectId = input.projectId;
      if (input.sectionId !== undefined) patch.sectionId = input.sectionId;
      if (input.parentId !== undefined) patch.parentId = input.parentId;
      return [{ kind: "relocate", ids: gatherSubtreeIds(qc, id), patch }];
    },
    errorMessage: "Couldn't move task",
  });
}

export function useDeleteTask() {
  return useTaskMutation<string>({
    mutationFn: async (id) => unwrap(await deleteTaskAction(id)),
    toCacheOps: (id, qc) => [{ kind: "remove", ids: gatherSubtreeIds(qc, id) }],
    errorMessage: "Couldn't delete task",
  });
}

/**
 * Create is not optimistic (no id/position yet) — the quick-add input clears
 * itself instantly and we reconcile on success.
 */
export function useCreateTask() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (input: TaskCreateInput) =>
      unwrap(await createTaskAction(input)),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.tasks });
      void qc.invalidateQueries({ queryKey: qk.projectTree });
    },
    onError: () => toast({ message: "Couldn't add task", variant: "error" }),
  });
}

export interface CreateFromTextVars {
  text: string;
  base?: CreateTaskFromTextBase;
}

/**
 * Quick capture from a natural-language line. Like useCreateTask it isn't
 * optimistic (the server parses authoritatively and assigns id/position), and
 * it may mint projects/labels — so labels are invalidated too.
 */
export function useCreateTaskFromText() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ text, base }: CreateFromTextVars) =>
      unwrap(await createTaskFromTextAction(text, base)),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.tasks });
      void qc.invalidateQueries({ queryKey: qk.projectTree });
      void qc.invalidateQueries({ queryKey: qk.labels });
    },
    onError: () => toast({ message: "Couldn't add task", variant: "error" }),
  });
}
