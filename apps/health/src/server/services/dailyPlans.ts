import {
  type DailyPlan,
  EntryOrigin,
  type MealSlot,
  Prisma,
} from "@/generated/prisma/client";
import { todayLocal } from "@/lib/dates";
import { scaleMacrosBy, sumMacros } from "@/lib/meals";
import { type Macros, scaleMacros } from "@/lib/rules";
import {
  type CreateDailyPlanInput,
  createDailyPlanSchema,
  type DailyPlanItemInput,
  type UpdateDailyPlanInput,
  updateDailyPlanSchema,
} from "@/lib/schemas/daily-plans";
import { prisma } from "@/server/db";
import { DomainError, NotFoundError } from "./errors";
import { getOrFetchProduct, logFood, macrosFromJson } from "./food";
import { logMeal } from "./meals";

// ----- Wire shapes (Decimal/JSON → numbers, the one coercion chokepoint) -----

/** A saved plan without its items — the list shows name, item count, total kcal. */
export interface DailyPlanSummary {
  id: string;
  name: string;
  notes: string | null;
  archived: boolean;
  itemCount: number;
  /** Macros of the whole plan, re-resolved on read from CURRENT sources (display only). */
  total: Macros;
  totalKcal: number | null;
  createdAt: string;
  updatedAt: string;
}

/** One plan item, with its CURRENT macro contribution and a display name. */
export interface DailyPlanItemView {
  id: string;
  position: number;
  productBarcode: string | null;
  customFoodId: string | null;
  mealId: string | null;
  quantityG: number | null;
  portions: number | null;
  mealSlot: MealSlot | null;
  macros: Macros;
  displayName: string;
}

/** A plan with its full item list — used by the builder (create/update/get). */
export interface DailyPlanDetail extends DailyPlanSummary {
  items: DailyPlanItemView[];
}

export interface DailyPlanCandidate {
  id: string;
  name: string;
}

/** Per-item outcome of applying a plan: how many logged, and which items were
 *  skipped (and why) — apply never throws the whole batch on one bad item. */
export interface ApplyDailyPlanResult {
  logged: number;
  skipped: { item: string; reason: string }[];
}

// ----- Serialization -----

const EMPTY_MACROS: Macros = {
  kcal: null,
  proteinG: null,
  carbG: null,
  fatG: null,
  fiberG: null,
  sugarG: null,
  saltG: null,
  caffeineMg: null,
};

// Items carry no stored macros (a plan is a pure reference); per-item / plan totals
// are resolved on read from each source's CURRENT macros, joined in one query. This
// is display only — applying always re-resolves fresh through logFood/logMeal.
const DETAIL_INCLUDE = {
  items: {
    orderBy: { position: "asc" },
    include: {
      product: { select: { name: true, per100g: true } },
      customFood: { select: { name: true, per100g: true } },
      meal: { select: { name: true, perPortion: true } },
    },
  },
} satisfies Prisma.DailyPlanInclude;

type PlanWithItems = Prisma.DailyPlanGetPayload<{
  include: {
    items: {
      include: {
        product: { select: { name: true; per100g: true } };
        customFood: { select: { name: true; per100g: true } };
        meal: { select: { name: true; perPortion: true } };
      };
    };
  };
}>;

const dec = (v: Prisma.Decimal | null): number | null =>
  v == null ? null : Number(v);

/** This item's CURRENT macro contribution: an OFF product or custom food scaled
 *  per-100 g by quantity; a meal scaled per-portion by portions. A since-deleted
 *  source (FK SET NULL nulls the reference) resolves to all-null macros. */
function resolveItemMacros(it: PlanWithItems["items"][number]): Macros {
  if (it.product) {
    return scaleMacros(macrosFromJson(it.product.per100g), Number(it.quantityG));
  }
  if (it.customFood) {
    return scaleMacros(
      macrosFromJson(it.customFood.per100g),
      Number(it.quantityG),
    );
  }
  if (it.meal) {
    return scaleMacrosBy(macrosFromJson(it.meal.perPortion), Number(it.portions));
  }
  return EMPTY_MACROS;
}

function serializeSummary(p: PlanWithItems): DailyPlanSummary {
  const total = sumMacros(p.items.map(resolveItemMacros));
  return {
    id: p.id,
    name: p.name,
    notes: p.notes,
    archived: p.archived,
    itemCount: p.items.length,
    total,
    totalKcal: total.kcal,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

function serializeItem(it: PlanWithItems["items"][number]): DailyPlanItemView {
  return {
    id: it.id,
    position: it.position,
    productBarcode: it.productBarcode,
    customFoodId: it.customFoodId,
    mealId: it.mealId,
    quantityG: dec(it.quantityG),
    portions: dec(it.portions),
    mealSlot: it.mealSlot,
    macros: resolveItemMacros(it),
    displayName:
      it.product?.name ?? it.customFood?.name ?? it.meal?.name ?? "Item",
  };
}

function serializeDetail(p: PlanWithItems): DailyPlanDetail {
  return { ...serializeSummary(p), items: p.items.map(serializeItem) };
}

// ----- Item validation + persistence -----

function toItemCreate(
  it: DailyPlanItemInput,
  position: number,
): Prisma.DailyPlanItemUncheckedCreateWithoutDailyPlanInput {
  return {
    position,
    productBarcode: it.barcode ?? null,
    customFoodId: it.customFoodId ?? null,
    mealId: it.mealId ?? null,
    quantityG: it.quantityG ?? null,
    portions: it.portions ?? null,
    mealSlot: it.mealSlot ?? null,
  };
}

/** Confirm every item's source currently exists before saving — and, for OFF
 *  barcodes, ensure the product is cached so the foreign key holds (getOrFetchProduct
 *  upserts the cache row). Throws NotFoundError for a missing source; the macros
 *  themselves are NOT snapshotted (apply re-resolves them later). */
async function ensureItemsResolvable(
  items: DailyPlanItemInput[],
): Promise<void> {
  for (const it of items) {
    if (it.barcode != null) {
      const product = await getOrFetchProduct(it.barcode);
      if (!product) throw new NotFoundError("product", it.barcode);
    } else if (it.customFoodId != null) {
      const food = await prisma.customFood.findUnique({
        where: { id: it.customFoodId },
      });
      if (!food) throw new NotFoundError("custom food", it.customFoodId);
    } else if (it.mealId != null) {
      const meal = await prisma.meal.findUnique({ where: { id: it.mealId } });
      if (!meal) throw new NotFoundError("meal", it.mealId);
    }
  }
}

/** Map a unique-name collision to a friendly DomainError; pass anything else through. */
function mapNameConflict(err: unknown, name: string): unknown {
  if (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === "P2002"
  ) {
    return new DomainError(`a plan named "${name}" already exists`);
  }
  return err;
}

// ----- Public API -----

/** Create a daily plan: validate every item's source exists, then persist the plan
 *  with its positioned reference items. Macros are NOT stored. */
export async function createDailyPlan(
  input: CreateDailyPlanInput,
): Promise<DailyPlanDetail> {
  const data = createDailyPlanSchema.parse(input);
  await ensureItemsResolvable(data.items);
  try {
    const plan = await prisma.dailyPlan.create({
      data: {
        name: data.name,
        notes: data.notes ?? null,
        items: { create: data.items.map(toItemCreate) },
      },
      include: DETAIL_INCLUDE,
    });
    return serializeDetail(plan);
  } catch (err) {
    throw mapNameConflict(err, data.name);
  }
}

/** Update a plan, fully replacing its editable fields and item list. */
export async function updateDailyPlan(
  id: string,
  input: UpdateDailyPlanInput,
): Promise<DailyPlanDetail> {
  const data = updateDailyPlanSchema.parse(input);
  const existing = await prisma.dailyPlan.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("daily plan", id);
  await ensureItemsResolvable(data.items);
  try {
    const plan = await prisma.dailyPlan.update({
      where: { id },
      data: {
        name: data.name,
        notes: data.notes ?? null,
        items: { deleteMany: {}, create: data.items.map(toItemCreate) },
      },
      include: DETAIL_INCLUDE,
    });
    return serializeDetail(plan);
  } catch (err) {
    throw mapNameConflict(err, data.name);
  }
}

/** Saved plans, alphabetical; excludes archived unless asked. */
export async function listDailyPlans(
  opts: { includeArchived?: boolean } = {},
): Promise<DailyPlanSummary[]> {
  const plans = await prisma.dailyPlan.findMany({
    where: opts.includeArchived ? {} : { archived: false },
    orderBy: { name: "asc" },
    include: DETAIL_INCLUDE,
  });
  return plans.map(serializeSummary);
}

/** A single plan with its items; 404s if it doesn't exist. */
export async function getDailyPlan(id: string): Promise<DailyPlanDetail> {
  const plan = await prisma.dailyPlan.findUnique({
    where: { id },
    include: DETAIL_INCLUDE,
  });
  if (!plan) throw new NotFoundError("daily plan", id);
  return serializeDetail(plan);
}

/** Archive a plan (hidden from the list; never deleted). 404s if it doesn't exist. */
export async function archiveDailyPlan(id: string): Promise<DailyPlanSummary> {
  try {
    const plan = await prisma.dailyPlan.update({
      where: { id },
      data: { archived: true },
      include: DETAIL_INCLUDE,
    });
    return serializeSummary(plan);
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2025"
    ) {
      throw new NotFoundError("daily plan", id);
    }
    throw err;
  }
}

/**
 * Resolve a plan by (case-insensitive) name for MCP: a single exact match returns
 * the plan; otherwise returns up to 10 candidates (exact-but-ambiguous, else
 * substring) so the caller can disambiguate WITHOUT a side effect. Archived excluded.
 */
export async function resolveDailyPlanByName(
  name: string,
): Promise<{ plan: DailyPlan } | { candidates: DailyPlanCandidate[] }> {
  const q = name.trim();
  const exact = await prisma.dailyPlan.findMany({
    where: { archived: false, name: { equals: q, mode: "insensitive" } },
    orderBy: { name: "asc" },
  });
  const first = exact[0];
  if (exact.length === 1 && first) return { plan: first };
  if (exact.length > 1) {
    return { candidates: exact.map((p) => ({ id: p.id, name: p.name })) };
  }
  const fuzzy = await prisma.dailyPlan.findMany({
    where: { archived: false, name: { contains: q, mode: "insensitive" } },
    orderBy: { name: "asc" },
    take: 10,
  });
  return { candidates: fuzzy.map((p) => ({ id: p.id, name: p.name })) };
}

/**
 * Apply a plan onto `day`'s diary: for each item IN ORDER, log it as an ordinary,
 * individually-editable FoodEntry through the EXISTING write paths — logFood for
 * product/custom-food items, logMeal for meal items — so every entry is snapshotted
 * by the same logic as a manual log. Stateless and repeatable: it never dedups and
 * keeps no "applied" state. A single failing item (e.g. a since-deleted source)
 * is skipped with a reason; the rest still log. `origin` stamps PWA vs MCP.
 */
export async function applyDailyPlan(
  dailyPlanId: string,
  day: string,
  origin: EntryOrigin,
): Promise<ApplyDailyPlanResult> {
  const plan = await prisma.dailyPlan.findUnique({
    where: { id: dailyPlanId },
    include: {
      items: {
        orderBy: { position: "asc" },
        include: {
          product: { select: { name: true } },
          customFood: { select: { name: true } },
          meal: { select: { name: true } },
        },
      },
    },
  });
  if (!plan) throw new NotFoundError("daily plan", dailyPlanId);

  // Pin entries to the chosen civil day: today logs at "now"; a past day logs at
  // UTC noon, which always lands inside the same Amsterdam civil day (the exact
  // rule the diary's optimistic logging uses).
  const eatenAt = day === todayLocal() ? undefined : `${day}T12:00:00.000Z`;

  let logged = 0;
  const skipped: { item: string; reason: string }[] = [];

  for (const it of plan.items) {
    const label =
      it.product?.name ??
      it.customFood?.name ??
      it.meal?.name ??
      `item ${it.position + 1}`;
    try {
      if (it.productBarcode != null) {
        await logFood(
          {
            barcode: it.productBarcode,
            quantityG: Number(it.quantityG),
            meal: it.mealSlot ?? undefined,
            eatenAt,
          },
          origin,
        );
      } else if (it.customFoodId != null) {
        await logFood(
          {
            customFoodId: it.customFoodId,
            quantityG: Number(it.quantityG),
            meal: it.mealSlot ?? undefined,
            eatenAt,
          },
          origin,
        );
      } else if (it.mealId != null) {
        await logMeal(
          {
            mealId: it.mealId,
            portions: Number(it.portions),
            meal: it.mealSlot ?? undefined,
            eatenAt,
          },
          origin,
        );
      } else {
        skipped.push({
          item: label,
          reason: "its product, custom food, or meal no longer exists",
        });
        continue;
      }
      logged += 1;
    } catch (err) {
      skipped.push({
        item: label,
        reason: err instanceof DomainError ? err.message : "could not be logged",
      });
    }
  }

  return { logged, skipped };
}
