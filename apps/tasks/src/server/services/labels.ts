import { generateKeyBetween } from "fractional-indexing";

import { Prisma, type Label } from "@/generated/prisma/client";
import {
  labelCreateSchema,
  labelUpdateSchema,
  orderRefSchema,
  type LabelCreateInput,
  type LabelUpdateInput,
  type OrderRefInput,
} from "@/lib/schemas";
import { prisma } from "@/server/db";

import { logEvent } from "./activity";
import {
  InvalidMoveError,
  InvalidOperationError,
  NotFoundError,
} from "./errors";
import { resolveNeighborOrders } from "./ordering";

function rethrowDuplicateName(err: unknown): never {
  if (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === "P2002"
  ) {
    throw new InvalidOperationError("label name already exists");
  }
  throw err;
}

export async function createLabel(input: LabelCreateInput): Promise<Label> {
  const data = labelCreateSchema.parse(input);
  try {
    return await prisma.$transaction(async (tx) => {
      const last = await tx.label.findFirst({
        orderBy: { order: "desc" },
        select: { order: true },
      });
      const label = await tx.label.create({
        data: { ...data, order: generateKeyBetween(last?.order ?? null, null) },
      });
      await logEvent(tx, "label", label.id, "label.created", {
        name: label.name,
      });
      return label;
    });
  } catch (err) {
    rethrowDuplicateName(err);
  }
}

export async function updateLabel(
  id: string,
  input: LabelUpdateInput,
): Promise<Label> {
  const data = labelUpdateSchema.parse(input);
  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.label.findUnique({ where: { id } });
      if (!existing) throw new NotFoundError("label", id);
      const label = await tx.label.update({ where: { id }, data });
      await logEvent(tx, "label", id, "label.updated", {
        changed: Object.keys(data),
      });
      return label;
    });
  } catch (err) {
    rethrowDuplicateName(err);
  }
}

export async function deleteLabel(id: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.label.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("label", id);
    await logEvent(tx, "label", id, "label.deleted", { name: existing.name });
    // TaskLabel rows cascade via the DB.
    await tx.label.delete({ where: { id } });
  });
}

export async function reorderLabel(
  id: string,
  ref: OrderRefInput,
): Promise<Label> {
  const parsedRef = orderRefSchema.parse(ref);
  return prisma.$transaction(async (tx) => {
    const existing = await tx.label.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("label", id);
    const siblings = await tx.label.findMany({
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
    const label = await tx.label.update({ where: { id }, data: { order } });
    await logEvent(tx, "label", id, "label.reordered", parsedRef);
    return label;
  });
}

export async function listLabels(): Promise<Label[]> {
  return prisma.label.findMany({ orderBy: { order: "asc" } });
}
