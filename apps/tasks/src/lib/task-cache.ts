// Pure, immutable transformers that apply an optimistic mutation to each
// shape of cached task data. The hook layer (use-task-mutations) snapshots a
// cache entry, dispatches the matching transformer here, and rolls back to the
// snapshot on error. Everything below is side-effect free and unit-tested.

/** Minimal task shape every cache transformer needs. */
export interface CacheTask {
  id: string;
  completedAt: Date | null;
}

/**
 * Structural mirror of TaskTreeNode that drops its SectionedTreeTask
 * constraint, so these transformers stay generic over CacheTask. The real
 * TaskTreeNode<TaskWithLabels> is assignable to this.
 */
export interface TreeNode<T> {
  task: T;
  subtasks: TreeNode<T>[];
}

/**
 * A single optimistic operation, dispatched against every cache shape.
 * - complete: `ids` is the task plus its cascade-completed descendants.
 * - reopen: a single task returns to incomplete.
 * - patch: shallow-merge edited fields into one task.
 * - remove: drop tasks (delete, or a move that leaves the current view).
 * - relocate: a move. The subtree leaves every project tree (position is
 *   resolved by refetch), but stays in the cross-project date/label/search
 *   lists with its container fields patched.
 */
export type TaskCacheOp<T extends CacheTask> =
  | { kind: "complete"; ids: readonly string[]; completedAt: Date }
  | { kind: "reopen"; id: string }
  | { kind: "patch"; id: string; patch: Partial<T> }
  | { kind: "remove"; ids: readonly string[] }
  | { kind: "relocate"; ids: readonly string[]; patch: Partial<T> };

/**
 * Apply an op to a single task. Returns the next task, or null when the task
 * should drop out of its list. `keepCompleted` decides whether a completed
 * task stays (patched) or is removed — true for an includeCompleted view,
 * false for the incomplete-only lists.
 */
function transformTask<T extends CacheTask>(
  task: T,
  op: TaskCacheOp<T>,
  keepCompleted: boolean,
): T | null {
  switch (op.kind) {
    case "complete":
      if (!op.ids.includes(task.id)) return task;
      return keepCompleted ? { ...task, completedAt: op.completedAt } : null;
    case "reopen":
      return op.id === task.id ? { ...task, completedAt: null } : task;
    case "patch":
      return op.id === task.id ? { ...task, ...op.patch } : task;
    case "remove":
      return op.ids.includes(task.id) ? null : task;
    case "relocate":
      // In flat lists the moved subtree stays put, only its container shifts.
      return op.ids.includes(task.id) ? { ...task, ...op.patch } : task;
  }
}

/** Incomplete-only flat list (today's tasks, upcoming, label, search). */
export function applyOpToFlatList<T extends CacheTask>(
  list: readonly T[],
  op: TaskCacheOp<T>,
): T[] {
  const out: T[] = [];
  for (const task of list) {
    const next = transformTask(task, op, false);
    if (next !== null) out.push(next);
  }
  return out;
}

export interface TodayViewCache<T extends CacheTask> {
  overdue: T[];
  today: T[];
}

/** Combined Today payload: overdue group + today's tasks, both incomplete. */
export function applyOpToTodayView<T extends CacheTask>(
  view: TodayViewCache<T>,
  op: TaskCacheOp<T>,
): TodayViewCache<T> {
  return {
    overdue: applyOpToFlatList(view.overdue, op),
    today: applyOpToFlatList(view.today, op),
  };
}

/** Label view: a flat incomplete list wrapped with its label metadata. */
export function applyOpToLabelView<
  T extends CacheTask,
  V extends { tasks: T[] },
>(view: V, op: TaskCacheOp<T>): V {
  return { ...view, tasks: applyOpToFlatList(view.tasks, op) };
}

/**
 * Apply an op across a forest of task-tree nodes, rebuilding immutably. A
 * dropped node takes its whole subtree with it (cascade-complete and delete
 * both clear descendants), so orphaned subtasks never surface.
 */
function transformNodes<T extends CacheTask>(
  nodes: readonly TreeNode<T>[],
  op: TaskCacheOp<T>,
  keepCompleted: boolean,
): TreeNode<T>[] {
  const out: TreeNode<T>[] = [];
  for (const node of nodes) {
    // A relocated subtree leaves the project tree entirely.
    if (op.kind === "relocate") {
      if (op.ids.includes(node.task.id)) continue;
      out.push({
        task: node.task,
        subtasks: transformNodes(node.subtasks, op, keepCompleted),
      });
      continue;
    }
    const task = transformTask(node.task, op, keepCompleted);
    if (task === null) continue;
    out.push({ task, subtasks: transformNodes(node.subtasks, op, keepCompleted) });
  }
  return out;
}

interface ProjectViewShape<T extends CacheTask> {
  rootTasks: TreeNode<T>[];
  sections: { tasks: TreeNode<T>[] }[];
}

/**
 * Project view: root tree + per-section trees. With includeCompleted a
 * completed task is patched in place; without it the task is removed so the
 * row animates out.
 */
export function applyOpToProjectView<
  T extends CacheTask,
  V extends ProjectViewShape<T>,
>(view: V, op: TaskCacheOp<T>, includeCompleted: boolean): V {
  return {
    ...view,
    rootTasks: transformNodes(view.rootTasks, op, includeCompleted),
    sections: view.sections.map((section) => ({
      ...section,
      tasks: transformNodes(section.tasks, op, includeCompleted),
    })),
  };
}

function flattenSubtreeIds<T extends CacheTask>(
  nodes: readonly TreeNode<T>[],
): string[] {
  const ids: string[] = [];
  for (const node of nodes) {
    ids.push(node.task.id);
    ids.push(...flattenSubtreeIds(node.subtasks));
  }
  return ids;
}

/**
 * Find `rootId` in a task-tree forest and return its id plus every descendant
 * id (for optimistic cascade-complete / delete). Returns [] when not found so
 * callers can fall back to [rootId].
 */
export function collectSubtreeIds<T extends CacheTask>(
  nodes: readonly TreeNode<T>[],
  rootId: string,
): string[] {
  for (const node of nodes) {
    if (node.task.id === rootId) {
      return [rootId, ...flattenSubtreeIds(node.subtasks)];
    }
    const found = collectSubtreeIds(node.subtasks, rootId);
    if (found.length > 0) return found;
  }
  return [];
}
