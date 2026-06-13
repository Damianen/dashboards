// Pure structural helpers over the Task parentId self-relation.

import { compareOrder } from "./ordering";

export interface TreeTask {
  id: string;
  parentId: string | null;
}

/**
 * Would re-parenting `taskId` under `newParentId` create a cycle?
 * Walks up from `newParentId`; the visited set guards against pre-existing
 * corrupt cycles in the input.
 */
export function wouldCreateCycle(
  taskId: string,
  newParentId: string,
  tasks: readonly TreeTask[],
): boolean {
  const parentById = new Map(tasks.map((t) => [t.id, t.parentId]));
  const visited = new Set<string>();
  let current: string | null = newParentId;
  while (current !== null) {
    if (current === taskId) return true;
    if (visited.has(current)) return false;
    visited.add(current);
    current = parentById.get(current) ?? null;
  }
  return false;
}

/** All descendant ids of `rootId` (BFS), excluding `rootId` itself. */
export function collectDescendantIds(
  rootId: string,
  tasks: readonly TreeTask[],
): string[] {
  const childrenByParent = new Map<string, string[]>();
  for (const t of tasks) {
    if (t.parentId === null) continue;
    const list = childrenByParent.get(t.parentId);
    if (list) list.push(t.id);
    else childrenByParent.set(t.parentId, [t.id]);
  }
  const result: string[] = [];
  const queue = [rootId];
  const seen = new Set([rootId]);
  while (queue.length > 0) {
    const children = childrenByParent.get(queue.shift()!) ?? [];
    for (const child of children) {
      if (seen.has(child)) continue;
      seen.add(child);
      result.push(child);
      queue.push(child);
    }
  }
  return result;
}

export interface SectionedTreeTask extends TreeTask {
  sectionId: string | null;
  order: string;
}

export interface TaskTreeNode<T extends SectionedTreeTask> {
  task: T;
  subtasks: TaskTreeNode<T>[];
}

/**
 * Nest tasks by parentId and sort every sibling list by `order`. Returns root
 * nodes grouped by sectionId (null = project root). A task whose parent is
 * absent from the input (e.g. a filtered-out completed parent) is treated as
 * a root in its own section bucket.
 */
export function buildTaskTree<T extends SectionedTreeTask>(
  tasks: readonly T[],
): Map<string | null, TaskTreeNode<T>[]> {
  const nodeById = new Map<string, TaskTreeNode<T>>(
    tasks.map((task) => [task.id, { task, subtasks: [] }]),
  );

  const roots = new Map<string | null, TaskTreeNode<T>[]>();
  for (const node of nodeById.values()) {
    const parent =
      node.task.parentId !== null ? nodeById.get(node.task.parentId) : undefined;
    if (parent) {
      parent.subtasks.push(node);
    } else {
      const key = node.task.sectionId;
      const list = roots.get(key);
      if (list) list.push(node);
      else roots.set(key, [node]);
    }
  }

  const byOrder = (a: TaskTreeNode<T>, b: TaskTreeNode<T>) =>
    compareOrder(a.task.order, b.task.order);
  for (const node of nodeById.values()) node.subtasks.sort(byOrder);
  for (const list of roots.values()) list.sort(byOrder);
  return roots;
}
