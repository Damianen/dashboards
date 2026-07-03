import {
  EntryOrigin,
  type FoodEntry,
  type Meal,
  Prisma,
} from "@/generated/prisma/client";
import { dayOf, dayToDbDate } from "@/lib/dates";
import {
  assertNoCycle,
  computeMealMacros,
  scaleMacrosBy,
} from "@/lib/meals";
import { type Macros, scaleMacros } from "@/lib/rules";
import {
  type CreateMealInput,
  createMealSchema,
  type LogMealInput,
  logMealSchema,
  type MealItemInput,
  type UpdateMealInput,
  updateMealSchema,
} from "@/lib/schemas/meals";
import { prisma } from "@/server/db";
import { toJsonValue } from "@/server/prisma-json";
import { DomainError, NotFoundError } from "./errors";
import {
  getOrFetchProduct,
  macrosFromJson,
  macrosFromProduct,
} from "./food";
import { resolveUniqueByName } from "./resolve-name";

// ----- Wire shapes (Decimal/JSON → numbers, the one coercion chokepoint) -----

/** A saved meal without its items — the meals list shows name, yield, per-portion kcal. */
export interface MealSummary {
  id: string;
  name: string;
  notes: string | null;
  yieldPortions: number;
  perPortion: Macros;
  perPortionKcal: number | null;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

/** One ingredient of a meal, with its contribution snapshot and a display name. */
export interface MealItemView {
  id: string;
  position: number;
  productBarcode: string | null;
  customFoodId: string | null;
  customName: string | null;
  childMealId: string | null;
  quantityG: number | null;
  childPortions: number | null;
  macros: Macros;
  displayName: string;
}

/** A meal with its full item list — used by the builder (create/update/get). */
export interface MealDetail extends MealSummary {
  items: MealItemView[];
}

export interface MealCandidate {
  id: string;
  name: string;
}

// ----- Serialization -----

type MealWithItems = Prisma.MealGetPayload<{
  include: {
    items: {
      include: {
        product: { select: { name: true; brand: true } };
        customFood: { select: { name: true; brand: true } };
        childMeal: { select: { name: true } };
      };
    };
  };
}>;

// orderBy doesn't change the payload shape, so it's omitted from MealWithItems above.
const DETAIL_INCLUDE = {
  items: {
    orderBy: { position: "asc" },
    include: {
      product: { select: { name: true, brand: true } },
      customFood: { select: { name: true, brand: true } },
      childMeal: { select: { name: true } },
    },
  },
} satisfies Prisma.MealInclude;

const dec = (v: Prisma.Decimal | null): number | null =>
  v == null ? null : Number(v);

function serializeMealSummary(m: Meal): MealSummary {
  const perPortion = macrosFromJson(m.perPortion);
  return {
    id: m.id,
    name: m.name,
    notes: m.notes,
    yieldPortions: Number(m.yieldPortions),
    perPortion,
    perPortionKcal: perPortion.kcal,
    archived: m.archived,
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
  };
}

function serializeMealItem(it: MealWithItems["items"][number]): MealItemView {
  return {
    id: it.id,
    position: it.position,
    productBarcode: it.productBarcode,
    customFoodId: it.customFoodId,
    customName: it.customName,
    childMealId: it.childMealId,
    quantityG: dec(it.quantityG),
    childPortions: dec(it.childPortions),
    macros: {
      kcal: dec(it.kcal),
      proteinG: dec(it.proteinG),
      carbG: dec(it.carbG),
      fatG: dec(it.fatG),
      fiberG: dec(it.fiberG),
      sugarG: dec(it.sugarG),
      saltG: dec(it.saltG),
      caffeineMg: dec(it.caffeineMg),
    },
    displayName:
      it.product?.name ??
      it.customFood?.name ??
      it.childMeal?.name ??
      it.customName ??
      "Item",
  };
}

function serializeMealDetail(m: MealWithItems): MealDetail {
  return { ...serializeMealSummary(m), items: m.items.map(serializeMealItem) };
}

// ----- Item resolution (resolve each item's CURRENT macros into a snapshot) -----

interface ResolvedItem {
  position: number;
  productBarcode: string | null;
  customFoodId: string | null;
  customName: string | null;
  childMealId: string | null;
  quantityG: number | null;
  childPortions: number | null;
  macros: Macros;
}

/** Narrow a value the Zod refines already guarantee, throwing a clean error if a
 *  hand-built input slipped through without it. */
function req<T>(v: T | null | undefined, message: string): T {
  if (v == null) throw new DomainError(message);
  return v;
}

/**
 * Resolve each item input to its CURRENT macro contribution (a snapshot). OFF and
 * custom-food items scale per-100 g by quantity (scaleMacros); a free-typed item
 * carries its own absolute macros; a nested meal folds its current per-portion macros
 * × childPortions (scaleMacrosBy). Nulls are preserved throughout.
 */
async function resolveItems(items: MealItemInput[]): Promise<ResolvedItem[]> {
  const resolved: ResolvedItem[] = [];
  for (const [position, it] of items.entries()) {
    const row: ResolvedItem = {
      position,
      productBarcode: null,
      customFoodId: null,
      customName: null,
      childMealId: null,
      quantityG: null,
      childPortions: null,
      macros: {
        kcal: null,
        proteinG: null,
        carbG: null,
        fatG: null,
        fiberG: null,
        sugarG: null,
        saltG: null,
        caffeineMg: null,
      },
    };

    if (it.barcode != null) {
      const quantityG = req(it.quantityG, "barcode item requires quantityG");
      const product = await getOrFetchProduct(it.barcode);
      if (!product) throw new NotFoundError("product", it.barcode);
      row.productBarcode = product.barcode;
      row.quantityG = quantityG;
      row.macros = scaleMacros(macrosFromProduct(product), quantityG);
    } else if (it.customFoodId != null) {
      const quantityG = req(it.quantityG, "customFoodId item requires quantityG");
      const food = await prisma.customFood.findUnique({
        where: { id: it.customFoodId },
      });
      if (!food) throw new NotFoundError("custom food", it.customFoodId);
      row.customFoodId = food.id;
      row.quantityG = quantityG;
      row.macros = scaleMacros(macrosFromJson(food.per100g), quantityG);
    } else if (it.childMealId != null) {
      const childPortions = req(
        it.childPortions,
        "nested-meal item requires childPortions",
      );
      const child = await prisma.meal.findUnique({
        where: { id: it.childMealId },
      });
      if (!child) throw new NotFoundError("meal", it.childMealId);
      if (child.archived) {
        throw new DomainError(`cannot nest an archived meal: ${child.name}`);
      }
      row.childMealId = child.id;
      row.childPortions = childPortions;
      row.macros = scaleMacrosBy(macrosFromJson(child.perPortion), childPortions);
    } else {
      // Free-typed item: its entered macros ARE its contribution (kcal required).
      row.customName = req(it.customName, "item has no source");
      row.quantityG = it.quantityG ?? null;
      row.macros = {
        kcal: req(it.kcal, "custom-name item requires kcal"),
        proteinG: it.proteinG ?? null,
        carbG: it.carbG ?? null,
        fatG: it.fatG ?? null,
        fiberG: it.fiberG ?? null,
        sugarG: it.sugarG ?? null,
        saltG: it.saltG ?? null,
        caffeineMg: it.caffeineMg ?? null,
      };
    }

    resolved.push(row);
  }
  return resolved;
}

function toItemCreate(
  r: ResolvedItem,
): Prisma.MealItemUncheckedCreateWithoutMealInput {
  return {
    position: r.position,
    productBarcode: r.productBarcode,
    customFoodId: r.customFoodId,
    customName: r.customName,
    childMealId: r.childMealId,
    quantityG: r.quantityG,
    childPortions: r.childPortions,
    kcal: r.macros.kcal,
    proteinG: r.macros.proteinG,
    carbG: r.macros.carbG,
    fatG: r.macros.fatG,
    fiberG: r.macros.fiberG,
    sugarG: r.macros.sugarG,
    saltG: r.macros.saltG,
    caffeineMg: r.macros.caffeineMg,
  };
}

/** The current nesting graph: each meal id → the ids of the meals it nests. */
async function buildAdjacency(): Promise<Record<string, string[]>> {
  const edges = await prisma.mealItem.findMany({
    where: { childMealId: { not: null } },
    select: { mealId: true, childMealId: true },
  });
  const adjacency: Record<string, string[]> = {};
  for (const e of edges) {
    if (e.childMealId == null) continue;
    (adjacency[e.mealId] ??= []).push(e.childMealId);
  }
  return adjacency;
}

/**
 * Resolve a meal's items to macro snapshots and compute its per-portion macros,
 * rejecting any nesting that would create a cycle. `selfId` is the meal being saved
 * ("" for a not-yet-created meal, which can't be in a cycle since nothing references it).
 */
async function prepareMeal(
  data: CreateMealInput,
  selfId: string,
): Promise<{ resolved: ResolvedItem[]; perPortion: Macros }> {
  const childIds = data.items
    .map((i) => i.childMealId)
    .filter((x): x is string => x != null);
  if (childIds.length > 0) {
    const adjacency = await buildAdjacency();
    for (const childId of childIds) assertNoCycle(selfId, childId, adjacency);
  }
  const resolved = await resolveItems(data.items);
  const { perPortion } = computeMealMacros(
    resolved.map((r) => r.macros),
    data.yieldPortions,
  );
  return { resolved, perPortion };
}

// ----- Public API -----

/**
 * Create a saved recipe: resolve each item's CURRENT macros (incl. a nested meal's
 * per-portion × childPortions), reject cycles, compute and STORE the per-portion macro
 * snapshot. Later edits to a sub-meal don't change this meal until it is re-saved.
 */
export async function createMeal(input: CreateMealInput): Promise<MealDetail> {
  const data = createMealSchema.parse(input);
  const { resolved, perPortion } = await prepareMeal(data, "");
  const meal = await prisma.meal.create({
    data: {
      name: data.name,
      notes: data.notes ?? null,
      yieldPortions: data.yieldPortions,
      perPortion: toJsonValue(perPortion),
      items: { create: resolved.map(toItemCreate) },
    },
    include: DETAIL_INCLUDE,
  });
  return serializeMealDetail(meal);
}

/**
 * Re-resolve a meal from its (replaced) item list against the CURRENT macros of every
 * source, recompute the per-portion snapshot, and swap the items atomically. This is
 * the only thing that updates a parent after a nested sub-meal changes.
 */
export async function updateMeal(
  id: string,
  input: UpdateMealInput,
): Promise<MealDetail> {
  const data = updateMealSchema.parse(input);
  const existing = await prisma.meal.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("meal", id);
  const { resolved, perPortion } = await prepareMeal(data, id);
  const meal = await prisma.meal.update({
    where: { id },
    data: {
      name: data.name,
      notes: data.notes ?? null,
      yieldPortions: data.yieldPortions,
      perPortion: toJsonValue(perPortion),
      items: { deleteMany: {}, create: resolved.map(toItemCreate) },
    },
    include: DETAIL_INCLUDE,
  });
  return serializeMealDetail(meal);
}

/** Saved meals, alphabetical; excludes archived unless asked. */
export async function listMeals(
  opts: { includeArchived?: boolean } = {},
): Promise<MealSummary[]> {
  const meals = await prisma.meal.findMany({
    where: opts.includeArchived ? {} : { archived: false },
    orderBy: { name: "asc" },
  });
  return meals.map(serializeMealSummary);
}

/** A single meal with its items; 404s if it doesn't exist. */
export async function getMeal(id: string): Promise<MealDetail> {
  const meal = await prisma.meal.findUnique({
    where: { id },
    include: DETAIL_INCLUDE,
  });
  if (!meal) throw new NotFoundError("meal", id);
  return serializeMealDetail(meal);
}

/** Archive a meal (hidden from the list; never deleted) or restore it. 404s if
 *  it doesn't exist. */
export async function setMealArchived(
  id: string,
  archived: boolean,
): Promise<MealSummary> {
  try {
    const meal = await prisma.meal.update({
      where: { id },
      data: { archived },
    });
    return serializeMealSummary(meal);
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2025"
    ) {
      throw new NotFoundError("meal", id);
    }
    throw err;
  }
}

/**
 * Resolve a meal by (case-insensitive) name for MCP: a single exact match returns the
 * meal; otherwise returns up to 10 candidates (exact-but-ambiguous, else substring) so
 * the caller can disambiguate WITHOUT a side effect. Archived meals are excluded.
 */
export async function resolveMealByName(
  name: string,
): Promise<{ meal: Meal } | { candidates: MealCandidate[] }> {
  const resolved = await resolveUniqueByName(name, (filter, take) =>
    prisma.meal.findMany({
      where: { archived: false, name: filter },
      orderBy: { name: "asc" },
      take,
    }),
  );
  return "match" in resolved ? { meal: resolved.match } : resolved;
}

/**
 * Log a meal as ONE combined diary entry, SNAPSHOTTING its macros: totals =
 * per-portion × portions (1 dp). The entry carries mealId, the portion count, the meal
 * name as customName, and the snapshotted totals — history never recomputes from the
 * recipe (CLAUDE.md). quantityG is null (meal entries are measured in portions). The
 * four required columns coalesce unknown → 0; fiber/sugar/salt and caffeine keep their
 * nulls. Caffeine rides along with the per-portion snapshot, so a caffeinated meal
 * (e.g. a pre-workout shake) raises the day's caffeine total and water target.
 */
export async function logMeal(
  input: LogMealInput,
  origin: EntryOrigin,
): Promise<FoodEntry> {
  const data = logMealSchema.parse(input);
  const meal = await prisma.meal.findUnique({ where: { id: data.mealId } });
  if (!meal) throw new NotFoundError("meal", data.mealId);
  const at = data.eatenAt ? new Date(data.eatenAt) : new Date();
  const day = dayToDbDate(dayOf(at));
  const totals = scaleMacrosBy(macrosFromJson(meal.perPortion), data.portions);
  return prisma.foodEntry.create({
    data: {
      eatenAt: at,
      day,
      mealId: meal.id,
      portions: data.portions,
      customName: meal.name,
      quantityG: null,
      kcal: totals.kcal ?? 0,
      proteinG: totals.proteinG ?? 0,
      carbG: totals.carbG ?? 0,
      fatG: totals.fatG ?? 0,
      fiberG: totals.fiberG,
      sugarG: totals.sugarG,
      saltG: totals.saltG,
      caffeineMg: totals.caffeineMg,
      meal: data.meal,
      origin,
    },
  });
}
