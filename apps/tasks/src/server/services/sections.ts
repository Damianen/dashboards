import { generateKeyBetween } from "fractional-indexing";

import type { Section } from "@/generated/prisma/client";
import {
  orderRefSchema,
  sectionCreateSchema,
  sectionUpdateSchema,
  type OrderRefInput,
  type SectionCreateInput,
  type SectionUpdateInput,
} from "@/lib/schemas";
import { prisma } from "@/server/db";

import { logEvent } from "./activity";
import { InvalidMoveError, NotFoundError } from "./errors";
import { resolveNeighborOrders } from "./ordering";

export async function createSection(
  input: SectionCreateInput,
): Promise<Section> {
  const data = sectionCreateSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    const project = await tx.project.findUnique({
      where: { id: data.projectId },
    });
    if (!project) throw new NotFoundError("project", data.projectId);
    const last = await tx.section.findFirst({
      where: { projectId: data.projectId },
      orderBy: { order: "desc" },
      select: { order: true },
    });
    const section = await tx.section.create({
      data: { ...data, order: generateKeyBetween(last?.order ?? null, null) },
    });
    await logEvent(tx, "section", section.id, "section.created", {
      name: section.name,
      projectId: section.projectId,
    });
    return section;
  });
}

export async function updateSection(
  id: string,
  input: SectionUpdateInput,
): Promise<Section> {
  const data = sectionUpdateSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    const existing = await tx.section.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("section", id);
    const section = await tx.section.update({ where: { id }, data });
    await logEvent(tx, "section", id, "section.updated", {
      changed: Object.keys(data),
    });
    return section;
  });
}

export async function deleteSection(id: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.section.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("section", id);
    await logEvent(tx, "section", id, "section.deleted", {
      name: existing.name,
      projectId: existing.projectId,
    });
    // The DB SetNull moves the section's tasks to the project root; their
    // fractional order keys stay globally comparable, so they merge
    // deterministically into the root ordering.
    await tx.section.delete({ where: { id } });
  });
}

export async function reorderSection(
  id: string,
  ref: OrderRefInput,
): Promise<Section> {
  const parsedRef = orderRefSchema.parse(ref);
  return prisma.$transaction(async (tx) => {
    const existing = await tx.section.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("section", id);
    const siblings = await tx.section.findMany({
      where: { projectId: existing.projectId, id: { not: id } },
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
    const section = await tx.section.update({ where: { id }, data: { order } });
    await logEvent(tx, "section", id, "section.reordered", parsedRef);
    return section;
  });
}

export async function listSections(projectId: string): Promise<Section[]> {
  return prisma.section.findMany({
    where: { projectId },
    orderBy: { order: "asc" },
  });
}
