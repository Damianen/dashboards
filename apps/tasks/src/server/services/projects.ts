import { generateKeyBetween } from "fractional-indexing";

import type { Project, Section } from "@/generated/prisma/client";
import {
  orderRefSchema,
  projectCreateSchema,
  projectUpdateSchema,
  type OrderRefInput,
  type ProjectCreateInput,
  type ProjectUpdateInput,
} from "@/lib/schemas";
import { prisma } from "@/server/db";

import { logEvent } from "./activity";
import {
  InvalidMoveError,
  InvalidOperationError,
  NotFoundError,
} from "./errors";
import { resolveNeighborOrders } from "./ordering";

export async function createProject(
  input: ProjectCreateInput,
): Promise<Project> {
  const data = projectCreateSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    const last = await tx.project.findFirst({
      orderBy: { order: "desc" },
      select: { order: true },
    });
    const project = await tx.project.create({
      data: { ...data, order: generateKeyBetween(last?.order ?? null, null) },
    });
    await logEvent(tx, "project", project.id, "project.created", {
      name: project.name,
    });
    return project;
  });
}

export async function updateProject(
  id: string,
  input: ProjectUpdateInput,
): Promise<Project> {
  const data = projectUpdateSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    const existing = await tx.project.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("project", id);
    const project = await tx.project.update({ where: { id }, data });
    await logEvent(tx, "project", id, "project.updated", {
      changed: Object.keys(data),
    });
    return project;
  });
}

export async function setProjectFavorite(
  id: string,
  isFavorite: boolean,
): Promise<Project> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.project.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("project", id);
    if (existing.isFavorite === isFavorite) return existing;
    const project = await tx.project.update({
      where: { id },
      data: { isFavorite },
    });
    await logEvent(
      tx,
      "project",
      id,
      isFavorite ? "project.favorited" : "project.unfavorited",
    );
    return project;
  });
}

export async function archiveProject(id: string): Promise<Project> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.project.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("project", id);
    if (existing.isInbox)
      throw new InvalidOperationError("the Inbox cannot be archived");
    if (existing.archivedAt !== null) return existing;
    const project = await tx.project.update({
      where: { id },
      data: { archivedAt: new Date() },
    });
    await logEvent(tx, "project", id, "project.archived");
    return project;
  });
}

export async function unarchiveProject(id: string): Promise<Project> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.project.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("project", id);
    if (existing.archivedAt === null) return existing;
    const project = await tx.project.update({
      where: { id },
      data: { archivedAt: null },
    });
    await logEvent(tx, "project", id, "project.unarchived");
    return project;
  });
}

export async function deleteProject(id: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.project.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("project", id);
    if (existing.isInbox)
      throw new InvalidOperationError("the Inbox cannot be deleted");
    await logEvent(tx, "project", id, "project.deleted", {
      name: existing.name,
    });
    // Tasks, sections, and comments cascade via the DB.
    await tx.project.delete({ where: { id } });
  });
}

export async function reorderProject(
  id: string,
  ref: OrderRefInput,
): Promise<Project> {
  const parsedRef = orderRefSchema.parse(ref);
  return prisma.$transaction(async (tx) => {
    const existing = await tx.project.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("project", id);
    const siblings = await tx.project.findMany({
      where: { id: { not: id } },
      select: { id: true, order: true },
      orderBy: { order: "asc" },
    });
    const { lower, upper } = resolveNeighborOrders(siblings, parsedRef);
    let order: string;
    try {
      order = generateKeyBetween(lower, upper);
    } catch {
      throw new InvalidMoveError("invalid reorder target");
    }
    const project = await tx.project.update({ where: { id }, data: { order } });
    await logEvent(tx, "project", id, "project.reordered", parsedRef);
    return project;
  });
}

export type ProjectTreeNode = Project & {
  sections: Section[];
  incompleteTaskCount: number;
};

/** Ordered flat project list (Inbox first), each with ordered sections. */
export async function getProjectTree(opts?: {
  includeArchived?: boolean;
}): Promise<ProjectTreeNode[]> {
  const [projects, counts] = await Promise.all([
    prisma.project.findMany({
      where: opts?.includeArchived ? {} : { archivedAt: null },
      orderBy: [{ isInbox: "desc" }, { order: "asc" }],
      include: { sections: { orderBy: { order: "asc" } } },
    }),
    prisma.task.groupBy({
      by: ["projectId"],
      where: { completedAt: null },
      _count: { _all: true },
    }),
  ]);
  const countByProject = new Map(
    counts.map((c) => [c.projectId, c._count._all]),
  );
  return projects.map((p) => ({
    ...p,
    incompleteTaskCount: countByProject.get(p.id) ?? 0,
  }));
}
