// Compact, stable JSON shapes for MCP tool output. The web UI consumes the
// service layer's rich tree types directly; agents are better served by flat,
// id-bearing records. `due_iso` is emitted in the same dialect parseDueIso
// reads back (bare date for all-day, offset-less wall-clock datetime when
// timed), so a value read from one tool round-trips into another.

import type { Project, Section, Task } from "@/generated/prisma/client";
import { dueAtToInputValues } from "@/lib/dates";
import type { TaskTreeNode } from "@/server/services/task-tree";
import type { TaskWithLabels } from "@/server/services/tasks";

export interface SerializedTask {
  id: string;
  content: string;
  description: string | null;
  priority: number;
  due_iso: string | null;
  all_day: boolean | null;
  timezone: string;
  recurring: boolean;
  completed: boolean;
  project_id: string;
  section_id: string | null;
  parent_id: string | null;
  labels: string[];
}

export function serializeTask(
  task: Task & { labels?: TaskWithLabels["labels"] },
): SerializedTask {
  let dueIso: string | null = null;
  if (task.dueAt !== null) {
    const { date, time } = dueAtToInputValues(
      task.dueAt,
      task.hasDueTime,
      task.timezone,
    );
    dueIso = time !== null ? `${date}T${time}` : date;
  }
  return {
    id: task.id,
    content: task.title,
    description: task.description,
    priority: task.priority,
    due_iso: dueIso,
    all_day: task.dueAt !== null ? !task.hasDueTime : null,
    timezone: task.timezone,
    recurring: task.rrule !== null,
    completed: task.completedAt !== null,
    project_id: task.projectId,
    section_id: task.sectionId,
    parent_id: task.parentId,
    labels: (task.labels ?? []).map((l) => l.name),
  };
}

export interface SerializedProject {
  id: string;
  name: string;
  is_inbox: boolean;
  is_favorite: boolean;
  archived: boolean;
  incomplete_task_count: number | null;
  sections: { id: string; name: string }[];
}

export function serializeProject(
  project: Project & {
    sections?: Section[];
    incompleteTaskCount?: number;
  },
): SerializedProject {
  return {
    id: project.id,
    name: project.name,
    is_inbox: project.isInbox,
    is_favorite: project.isFavorite,
    archived: project.archivedAt !== null,
    incomplete_task_count: project.incompleteTaskCount ?? null,
    sections: (project.sections ?? []).map((s) => ({ id: s.id, name: s.name })),
  };
}

/** Flatten a parentId-nested task tree (depth-first) into a plain list. */
export function flattenTree(
  nodes: TaskTreeNode<TaskWithLabels>[],
): TaskWithLabels[] {
  const out: TaskWithLabels[] = [];
  const walk = (ns: TaskTreeNode<TaskWithLabels>[]) => {
    for (const n of ns) {
      out.push(n.task);
      walk(n.subtasks);
    }
  };
  walk(nodes);
  return out;
}
