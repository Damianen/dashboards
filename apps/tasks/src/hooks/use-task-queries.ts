"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { qk } from "@/lib/query-keys";
import { listLabelsAction } from "@/server/actions/labels";
import { getProjectTreeAction } from "@/server/actions/projects";
import { unwrap } from "@/server/actions/result";
import {
  listProjectViewAction,
  listTasksByLabelAction,
  listTodayViewAction,
  listUpcomingAction,
  searchTasksAction,
} from "@/server/actions/tasks";
import type { Label } from "@/generated/prisma/client";
import type { ProjectTreeNode } from "@/server/services/projects";
import type {
  LabelTasksView,
  ProjectTasksView,
  TaskWithLabels,
} from "@/server/services/tasks";

export interface TodayView {
  overdue: TaskWithLabels[];
  today: TaskWithLabels[];
}

export function useTodayView(initialData?: TodayView) {
  return useQuery({
    queryKey: qk.todayView,
    queryFn: async () => unwrap(await listTodayViewAction()),
    initialData,
  });
}

export function useUpcoming(days: number, initialData?: TaskWithLabels[]) {
  return useQuery({
    queryKey: qk.upcoming(days),
    queryFn: async () => unwrap(await listUpcomingAction(days)),
    initialData,
  });
}

export function useProjectView(
  id: string,
  includeCompleted: boolean,
  initialData?: ProjectTasksView,
) {
  return useQuery({
    queryKey: qk.project(id, includeCompleted),
    queryFn: async () =>
      unwrap(await listProjectViewAction(id, includeCompleted)),
    initialData,
  });
}

export function useLabelView(id: string, initialData?: LabelTasksView) {
  return useQuery({
    queryKey: qk.label(id),
    queryFn: async () => unwrap(await listTasksByLabelAction(id)),
    initialData,
  });
}

export function useProjectTree(initialData?: ProjectTreeNode[]) {
  return useQuery({
    queryKey: qk.projectTree,
    queryFn: async () => unwrap(await getProjectTreeAction()),
    initialData,
  });
}

export function useLabels(initialData?: Label[]) {
  return useQuery({
    queryKey: qk.labels,
    queryFn: async () => unwrap(await listLabelsAction()),
    initialData,
  });
}

/** Debounced query string is supplied by the caller; empty disables the run. */
export function useSearch(query: string) {
  return useQuery({
    queryKey: qk.search(query),
    queryFn: async () => unwrap(await searchTasksAction(query)),
    enabled: query.trim().length > 0,
    placeholderData: keepPreviousData,
  });
}
