import { generateKeyBetween } from "fractional-indexing";

import { Prisma, type SavedFilter } from "@/generated/prisma/client";
import { DEFAULT_TIMEZONE } from "@/lib/dates";
import { compileFilter } from "@/lib/filterlang";
import {
  orderRefSchema,
  savedFilterCreateSchema,
  savedFilterUpdateSchema,
  type OrderRefInput,
  type SavedFilterCreateInput,
  type SavedFilterUpdateInput,
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
    throw new InvalidOperationError("filter name already exists");
  }
  throw err;
}

/** Reject a filter that doesn't parse, so a broken query can never be saved. */
function assertValidQuery(query: string): void {
  compileFilter(query, { now: new Date(), timeZone: DEFAULT_TIMEZONE });
}

export async function createSavedFilter(
  input: SavedFilterCreateInput,
): Promise<SavedFilter> {
  const data = savedFilterCreateSchema.parse(input);
  assertValidQuery(data.query);
  try {
    return await prisma.$transaction(async (tx) => {
      const last = await tx.savedFilter.findFirst({
        orderBy: { order: "desc" },
        select: { order: true },
      });
      const filter = await tx.savedFilter.create({
        data: { ...data, order: generateKeyBetween(last?.order ?? null, null) },
      });
      await logEvent(tx, "savedFilter", filter.id, "savedFilter.created", {
        name: filter.name,
      });
      return filter;
    });
  } catch (err) {
    rethrowDuplicateName(err);
  }
}

export async function updateSavedFilter(
  id: string,
  input: SavedFilterUpdateInput,
): Promise<SavedFilter> {
  const data = savedFilterUpdateSchema.parse(input);
  if (data.query !== undefined) assertValidQuery(data.query);
  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.savedFilter.findUnique({ where: { id } });
      if (!existing) throw new NotFoundError("filter", id);
      const filter = await tx.savedFilter.update({ where: { id }, data });
      await logEvent(tx, "savedFilter", id, "savedFilter.updated", {
        changed: Object.keys(data),
      });
      return filter;
    });
  } catch (err) {
    rethrowDuplicateName(err);
  }
}

export async function deleteSavedFilter(id: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.savedFilter.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("filter", id);
    await logEvent(tx, "savedFilter", id, "savedFilter.deleted", {
      name: existing.name,
    });
    await tx.savedFilter.delete({ where: { id } });
  });
}

export async function reorderSavedFilter(
  id: string,
  ref: OrderRefInput,
): Promise<SavedFilter> {
  const parsedRef = orderRefSchema.parse(ref);
  return prisma.$transaction(async (tx) => {
    const existing = await tx.savedFilter.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("filter", id);
    const siblings = await tx.savedFilter.findMany({
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
    const filter = await tx.savedFilter.update({
      where: { id },
      data: { order },
    });
    await logEvent(tx, "savedFilter", id, "savedFilter.reordered", parsedRef);
    return filter;
  });
}

export async function listSavedFilters(): Promise<SavedFilter[]> {
  return prisma.savedFilter.findMany({ orderBy: { order: "asc" } });
}

export async function getSavedFilter(id: string): Promise<SavedFilter> {
  const filter = await prisma.savedFilter.findUnique({ where: { id } });
  if (!filter) throw new NotFoundError("filter", id);
  return filter;
}
