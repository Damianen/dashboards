import { generateKeyBetween } from "fractional-indexing";

import {
  Prisma,
  type Label,
  type Project,
  type Section,
  type Task,
} from "@/generated/prisma/client";
import {
  DEFAULT_TIMEZONE,
  normalizeDueAt,
  todayWindow,
  upcomingWindow,
  zonedDayStart,
} from "@/lib/dates";
import {
  taskCreateSchema,
  taskMoveSchema,
  taskUpdateSchema,
  type TaskCreateInput,
  type TaskMoveInput,
  type TaskUpdateInput,
} from "@/lib/schemas";
import { prisma } from "@/server/db";

import { logEvent, type Tx } from "./activity";
import {
  InvalidMoveError,
  NotFoundError,
  NotImplementedError,
} from "./errors";
import { compareOrder, resolveNeighborOrders } from "./ordering";
import {
  buildTaskTree,
  collectDescendantIds,
  wouldCreateCycle,
  type TaskTreeNode,
} from "./task-tree";

// All-day tasks (hasDueTime=false) store dueAt as local midnight of the due
// day in the task's timezone — see src/lib/dates.ts. The view helpers below
// rely on that write-side normalization.

const labelInclude = {
  labels: { include: { label: true } },
} satisfies Prisma.TaskInclude;

type TaskWithLabelJoins = Prisma.TaskGetPayload<{
  include: typeof labelInclude;
}>;

export type TaskWithLabels = Task & { labels: Label[] };

function flattenLabels(task: TaskWithLabelJoins): TaskWithLabels {
  const { labels, ...rest } = task;
  return {
    ...rest,
    labels: labels
      .map((tl) => tl.label)
      .sort((a, b) => compareOrder(a.order, b.order)),
  };
}

/** Ordering scope: subtasks order among their siblings, root tasks within their section. */
function siblingScope(task: {
  projectId: string;
  sectionId: string | null;
  parentId: string | null;
}): Prisma.TaskWhereInput {
  return task.parentId !== null
    ? { parentId: task.parentId }
    : { projectId: task.projectId, sectionId: task.sectionId, parentId: null };
}

async function appendOrder(
  tx: Tx,
  scope: Prisma.TaskWhereInput,
): Promise<string> {
  const last = await tx.task.findFirst({
    where: scope,
    orderBy: { order: "desc" },
    select: { order: true },
  });
  return generateKeyBetween(last?.order ?? null, null);
}

function rethrowUnknownLabel(err: unknown): never {
  if (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === "P2003"
  ) {
    throw new NotFoundError("label");
  }
  throw err;
}

export async function createTask(
  input: TaskCreateInput,
): Promise<TaskWithLabels> {
  const data = taskCreateSchema.parse(input);
  try {
    return await prisma.$transaction(async (tx) => {
      let projectId: string;
      let parentId: string | null = null;
      let sectionId: string | null = null;

      if (data.parentId !== undefined) {
        const parent = await tx.task.findUnique({
          where: { id: data.parentId },
        });
        if (!parent) throw new NotFoundError("task", data.parentId);
        if (data.projectId !== undefined && data.projectId !== parent.projectId)
          throw new InvalidMoveError(
            "projectId conflicts with the parent task's project",
          );
        projectId = parent.projectId;
        parentId = parent.id;
      } else if (data.projectId !== undefined) {
        const project = await tx.project.findUnique({
          where: { id: data.projectId },
        });
        if (!project) throw new NotFoundError("project", data.projectId);
        projectId = project.id;
      } else {
        const inbox = await tx.project.findFirst({ where: { isInbox: true } });
        if (!inbox) throw new NotFoundError("inbox");
        projectId = inbox.id;
      }

      if (data.sectionId !== undefined) {
        const section = await tx.section.findUnique({
          where: { id: data.sectionId },
        });
        if (!section) throw new NotFoundError("section", data.sectionId);
        if (section.projectId !== projectId)
          throw new InvalidMoveError(
            "section belongs to a different project",
          );
        sectionId = section.id;
      }

      const order = await appendOrder(
        tx,
        siblingScope({ projectId, sectionId, parentId }),
      );
      const task = await tx.task.create({
        data: {
          title: data.title,
          description: data.description,
          priority: data.priority,
          dueAt:
            data.dueAt !== undefined
              ? normalizeDueAt(
                  data.dueAt,
                  data.hasDueTime ?? false,
                  data.timezone ?? DEFAULT_TIMEZONE,
                )
              : undefined,
          hasDueTime: data.hasDueTime,
          timezone: data.timezone,
          rrule: data.rrule,
          recursFromCompletion: data.recursFromCompletion,
          projectId,
          sectionId,
          parentId,
          order,
          ...(data.labelIds?.length
            ? { labels: { create: data.labelIds.map((labelId) => ({ labelId })) } }
            : {}),
        },
        include: labelInclude,
      });
      await logEvent(tx, "task", task.id, "task.created", {
        title: task.title,
        projectId,
      });
      return flattenLabels(task);
    });
  } catch (err) {
    rethrowUnknownLabel(err);
  }
}

export async function updateTask(
  id: string,
  input: TaskUpdateInput,
): Promise<TaskWithLabels> {
  const data = taskUpdateSchema.parse(input);
  try {
    return await prisma.$transaction(async (tx) => {
      const current = await tx.task.findUnique({ where: { id } });
      if (!current) throw new NotFoundError("task", id);

      const { labelIds, ...columns } = data;
      // Re-normalize the effective due date: a patch may change any of
      // dueAt / hasDueTime / timezone independently.
      const effDueAt =
        columns.dueAt === undefined ? current.dueAt : columns.dueAt;
      if (effDueAt !== null) {
        columns.dueAt = normalizeDueAt(
          effDueAt,
          columns.hasDueTime ?? current.hasDueTime,
          columns.timezone ?? current.timezone,
        );
      }

      if (labelIds !== undefined) {
        await tx.taskLabel.deleteMany({ where: { taskId: id } });
        if (labelIds.length > 0) {
          await tx.taskLabel.createMany({
            data: labelIds.map((labelId) => ({ taskId: id, labelId })),
          });
        }
      }
      const task = await tx.task.update({
        where: { id },
        data: columns,
        include: labelInclude,
      });
      await logEvent(tx, "task", id, "task.updated", {
        changed: Object.keys(data),
      });
      return flattenLabels(task);
    });
  } catch (err) {
    rethrowUnknownLabel(err);
  }
}

/**
 * Move a task across project/section/parent and/or reorder it among its
 * siblings. A call with only beforeId/afterId is an in-place reorder.
 * Cross-project moves bring all descendants along (their sections reset).
 */
export async function moveTask(
  id: string,
  input: TaskMoveInput,
): Promise<TaskWithLabels> {
  const data = taskMoveSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    const task = await tx.task.findUnique({ where: { id } });
    if (!task) throw new NotFoundError("task", id);

    let projectId: string;
    let parentId: string | null;
    let sectionId: string | null;

    if (typeof data.parentId === "string") {
      const parent = await tx.task.findUnique({
        where: { id: data.parentId },
      });
      if (!parent) throw new NotFoundError("task", data.parentId);
      if (data.projectId !== undefined && data.projectId !== parent.projectId)
        throw new InvalidMoveError(
          "projectId conflicts with the parent task's project",
        );
      projectId = parent.projectId;
      parentId = parent.id;
      sectionId = null;

      const treeTasks = await tx.task.findMany({
        where: { projectId: { in: [parent.projectId, task.projectId] } },
        select: { id: true, parentId: true },
      });
      if (wouldCreateCycle(id, parent.id, treeTasks))
        throw new InvalidMoveError("move would create a cycle");
    } else {
      projectId = data.projectId ?? task.projectId;
      if (data.projectId !== undefined && data.projectId !== task.projectId) {
        const project = await tx.project.findUnique({
          where: { id: data.projectId },
        });
        if (!project) throw new NotFoundError("project", data.projectId);
      }
      const projectChanged = projectId !== task.projectId;
      // Explicit null detaches; a cross-project move or a move into a
      // section auto-detaches; otherwise the parent is kept.
      parentId =
        data.parentId === null || projectChanged || data.sectionId
          ? null
          : task.parentId;
      sectionId =
        data.sectionId !== undefined
          ? data.sectionId
          : projectChanged || parentId !== null
            ? null
            : task.sectionId;
      if (sectionId !== null) {
        const section = await tx.section.findUnique({
          where: { id: sectionId },
        });
        if (!section) throw new NotFoundError("section", sectionId);
        if (section.projectId !== projectId)
          throw new InvalidMoveError("section belongs to a different project");
      }
    }

    const projectChanged = projectId !== task.projectId;
    let descendantIds: string[] = [];
    if (projectChanged) {
      const oldProjectTasks = await tx.task.findMany({
        where: { projectId: task.projectId },
        select: { id: true, parentId: true },
      });
      descendantIds = collectDescendantIds(id, oldProjectTasks);
    }

    const siblings = await tx.task.findMany({
      where: {
        ...siblingScope({ projectId, sectionId, parentId }),
        id: { not: id },
      },
      select: { id: true, order: true },
      orderBy: { order: "asc" },
    });
    const { lower, upper } = resolveNeighborOrders(siblings, {
      beforeId: data.beforeId,
      afterId: data.afterId,
    });
    let order: string;
    try {
      order = generateKeyBetween(lower, upper);
    } catch {
      throw new InvalidMoveError("invalid reorder target");
    }

    const updated = await tx.task.update({
      where: { id },
      data: { projectId, sectionId, parentId, order },
      include: labelInclude,
    });
    if (descendantIds.length > 0) {
      await tx.task.updateMany({
        where: { id: { in: descendantIds } },
        data: { projectId, sectionId: null },
      });
    }

    const containerChanged =
      projectChanged ||
      sectionId !== task.sectionId ||
      parentId !== task.parentId;
    await logEvent(
      tx,
      "task",
      id,
      containerChanged ? "task.moved" : "task.reordered",
      containerChanged
        ? {
            from: {
              projectId: task.projectId,
              sectionId: task.sectionId,
              parentId: task.parentId,
            },
            to: { projectId, sectionId, parentId },
          }
        : { beforeId: data.beforeId ?? null, afterId: data.afterId ?? null },
    );
    return flattenLabels(updated);
  });
}

/**
 * THE completion chokepoint — every complete goes through here. Cascade-
 * completes all incomplete descendants atomically. Recurring tasks (rrule)
 * are rejected until phase 6; CompletionLog stays untouched until then.
 */
export async function completeTask(
  id: string,
): Promise<{ task: Task; completedDescendantIds: string[] }> {
  return prisma.$transaction(async (tx) => {
    const task = await tx.task.findUnique({ where: { id } });
    if (!task) throw new NotFoundError("task", id);
    if (task.completedAt !== null)
      return { task, completedDescendantIds: [] };
    if (task.rrule !== null)
      throw new NotImplementedError("recurrence lands in phase 6");

    const projectTasks = await tx.task.findMany({
      where: { projectId: task.projectId },
      select: { id: true, parentId: true, rrule: true, completedAt: true },
    });
    const byId = new Map(projectTasks.map((t) => [t.id, t]));
    const descendantIds = collectDescendantIds(id, projectTasks).filter(
      (descId) => byId.get(descId)!.completedAt === null,
    );
    if (descendantIds.some((descId) => byId.get(descId)!.rrule !== null))
      throw new NotImplementedError("recurrence lands in phase 6");

    const completedAt = new Date();
    await tx.task.updateMany({
      where: { id: { in: [id, ...descendantIds] } },
      data: { completedAt },
    });
    await logEvent(tx, "task", id, "task.completed");
    for (const descId of descendantIds) {
      await logEvent(tx, "task", descId, "task.completed", {
        cascadedFrom: id,
      });
    }
    return {
      task: { ...task, completedAt },
      completedDescendantIds: descendantIds,
    };
  });
}

/** Reopens only the task itself; completed subtasks stay completed. */
export async function reopenTask(id: string): Promise<Task> {
  return prisma.$transaction(async (tx) => {
    const task = await tx.task.findUnique({ where: { id } });
    if (!task) throw new NotFoundError("task", id);
    if (task.completedAt === null) return task;
    const reopened = await tx.task.update({
      where: { id },
      data: { completedAt: null },
    });
    await logEvent(tx, "task", id, "task.reopened");
    return reopened;
  });
}

export async function deleteTask(id: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const task = await tx.task.findUnique({ where: { id } });
    if (!task) throw new NotFoundError("task", id);
    await logEvent(tx, "task", id, "task.deleted", { title: task.title });
    // Subtasks, comments, and label links cascade via the DB.
    await tx.task.delete({ where: { id } });
  });
}

// ---------------------------------------------------------------------------
// List helpers — reads only, no transactions, no activity events.

export interface ProjectTasksView {
  project: Project;
  rootTasks: TaskTreeNode<TaskWithLabels>[];
  sections: { section: Section; tasks: TaskTreeNode<TaskWithLabels>[] }[];
}

/**
 * Full ordered view of a project: root tasks and per-section tasks, each
 * nested by parentId. With includeCompleted=false an incomplete subtask of a
 * completed parent surfaces as a root.
 */
export async function listTasksByProject(
  projectId: string,
  opts?: { includeCompleted?: boolean },
): Promise<ProjectTasksView> {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new NotFoundError("project", projectId);
  const [sections, tasks] = await Promise.all([
    prisma.section.findMany({
      where: { projectId },
      orderBy: { order: "asc" },
    }),
    prisma.task.findMany({
      where: {
        projectId,
        ...(opts?.includeCompleted ? {} : { completedAt: null }),
      },
      include: labelInclude,
    }),
  ]);
  const tree = buildTaskTree(tasks.map(flattenLabels));
  return {
    project,
    rootTasks: tree.get(null) ?? [],
    sections: sections.map((section) => ({
      section,
      tasks: tree.get(section.id) ?? [],
    })),
  };
}

const viewOrderBy = [
  { dueAt: "asc" },
  { priority: "asc" },
  { order: "asc" },
] satisfies Prisma.TaskOrderByWithRelationInput[];

interface ViewOpts {
  timeZone?: string;
  now?: Date;
}

/** Incomplete tasks due today (local day window); overdue is separate. */
export async function listToday(opts?: ViewOpts): Promise<TaskWithLabels[]> {
  const { start, end } = todayWindow(opts?.timeZone, opts?.now);
  const tasks = await prisma.task.findMany({
    where: { completedAt: null, dueAt: { gte: start, lt: end } },
    orderBy: viewOrderBy,
    include: labelInclude,
  });
  return tasks.map(flattenLabels);
}

/**
 * Incomplete tasks past due: timed tasks after their exact time, all-day
 * tasks from the first local midnight after their due day.
 */
export async function listOverdue(opts?: ViewOpts): Promise<TaskWithLabels[]> {
  const now = opts?.now ?? new Date();
  const todayStart = zonedDayStart(now, opts?.timeZone ?? DEFAULT_TIMEZONE);
  const tasks = await prisma.task.findMany({
    where: {
      completedAt: null,
      OR: [
        { hasDueTime: true, dueAt: { lt: now } },
        { hasDueTime: false, dueAt: { lt: todayStart } },
      ],
    },
    orderBy: viewOrderBy,
    include: labelInclude,
  });
  return tasks.map(flattenLabels);
}

/** Incomplete tasks due within [tomorrow, tomorrow + days) local days. */
export async function listUpcoming(
  days: number,
  opts?: ViewOpts,
): Promise<TaskWithLabels[]> {
  const { start, end } = upcomingWindow(days, opts?.timeZone, opts?.now);
  const tasks = await prisma.task.findMany({
    where: { completedAt: null, dueAt: { gte: start, lt: end } },
    orderBy: viewOrderBy,
    include: labelInclude,
  });
  return tasks.map(flattenLabels);
}

export async function listCompleted(opts?: {
  cursor?: string;
  limit?: number;
}): Promise<{ items: Task[]; nextCursor: string | null }> {
  const limit = Math.min(Math.max(opts?.limit ?? 20, 1), 100);
  const rows = await prisma.task.findMany({
    where: { completedAt: { not: null } },
    orderBy: [{ completedAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(opts?.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
  });
  const items = rows.slice(0, limit);
  return {
    items,
    nextCursor: rows.length > limit ? items[items.length - 1].id : null,
  };
}

export async function searchTasks(
  query: string,
  opts?: { includeCompleted?: boolean; limit?: number },
): Promise<TaskWithLabels[]> {
  const q = query.trim();
  if (q.length === 0) return [];
  const tasks = await prisma.task.findMany({
    where: {
      ...(opts?.includeCompleted ? {} : { completedAt: null }),
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
      ],
    },
    orderBy: { updatedAt: "desc" },
    take: Math.min(Math.max(opts?.limit ?? 50, 1), 200),
    include: labelInclude,
  });
  return tasks.map(flattenLabels);
}
