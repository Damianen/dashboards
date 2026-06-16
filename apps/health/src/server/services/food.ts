import {
  EntryOrigin,
  type FoodEntry,
  type FoodProduct,
  Prisma,
} from "@/generated/prisma/client";
import { dayOf, dayToDbDate, todayLocal } from "@/lib/dates";
import { type Macros, scaleMacros } from "@/lib/rules";
import { type LogFoodInput, logFoodSchema } from "@/lib/schemas/food";
import { prisma } from "@/server/db";
import { NotFoundError } from "./errors";
import { fetchProduct } from "./off";

const PRODUCT_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * The cached product for `barcode`, refreshing from OFF if missing or older than
 * 30 days. Stale-while-revalidate: if the OFF fetch fails (network/timeout/parse)
 * we serve the cached row when we have one. Returns null only when the product is
 * both uncached and unknown to OFF. Never deletes — the local DB is the truth.
 */
export async function getOrFetchProduct(
  barcode: string,
): Promise<FoodProduct | null> {
  const cached = await prisma.foodProduct.findUnique({ where: { barcode } });
  if (cached && Date.now() - cached.fetchedAt.getTime() < PRODUCT_TTL_MS) {
    return cached;
  }
  try {
    const off = await fetchProduct(barcode);
    if (!off) return cached ?? null; // unknown to OFF — keep any stale row
    const data = {
      name: off.name,
      brand: off.brand,
      imageUrl: off.imageUrl,
      per100g: off.per100g as unknown as Prisma.InputJsonValue,
      servingG: off.servingG,
      raw: off.raw as Prisma.InputJsonValue,
      fetchedAt: new Date(),
    };
    return await prisma.foodProduct.upsert({
      where: { barcode },
      create: { barcode, ...data },
      update: data,
    });
  } catch {
    return cached ?? null; // OFF unreachable — serve stale, never delete
  }
}

/** Read our normalized per-100g macros back off a cached product's JSON column. */
function macrosFromProduct(product: FoodProduct): Macros {
  const json = product.per100g;
  const m: Record<string, unknown> =
    typeof json === "object" && json !== null && !Array.isArray(json)
      ? (json as Record<string, unknown>)
      : {};
  const num = (k: string): number | null =>
    typeof m[k] === "number" ? (m[k] as number) : null;
  return {
    kcal: num("kcal"),
    proteinG: num("proteinG"),
    carbG: num("carbG"),
    fatG: num("fatG"),
    fiberG: num("fiberG"),
    sugarG: num("sugarG"),
    saltG: num("saltG"),
  };
}

/**
 * Log a food entry, SNAPSHOTTING its macros at log time (CLAUDE.md: history never
 * recomputes from the cache). A `barcode` resolves through the product cache and
 * scales by quantity; a custom entry needs `customName` + `kcal`. Explicit macro
 * fields in the input override the computed ones. The four required columns
 * (kcal/protein/carb/fat) coalesce unknown → 0 so daily_summary SUMs stay clean;
 * fiber/sugar/salt keep their nulls.
 */
export async function logFood(
  input: LogFoodInput,
  origin: EntryOrigin,
): Promise<FoodEntry> {
  const data = logFoodSchema.parse(input);
  const at = data.eatenAt ? new Date(data.eatenAt) : new Date();
  const day = dayToDbDate(dayOf(at));

  let base: Macros;
  let productBarcode: string | null = null;
  let customName: string | null = null;

  if (data.barcode != null) {
    const product = await getOrFetchProduct(data.barcode);
    if (!product) throw new NotFoundError("product", data.barcode);
    productBarcode = product.barcode;
    base = scaleMacros(macrosFromProduct(product), data.quantityG);
  } else {
    customName = data.customName ?? null; // refine guarantees presence
    base = {
      kcal: null,
      proteinG: null,
      carbG: null,
      fatG: null,
      fiberG: null,
      sugarG: null,
      saltG: null,
    };
  }

  // Explicit overrides win; `undefined` (omitted) keeps the computed value, so an
  // intentional 0 is preserved (we test `!== undefined`, never `??`).
  const pick = (override: number | undefined, computed: number | null) =>
    override !== undefined ? override : computed;
  const snap: Macros = {
    kcal: pick(data.kcal, base.kcal),
    proteinG: pick(data.proteinG, base.proteinG),
    carbG: pick(data.carbG, base.carbG),
    fatG: pick(data.fatG, base.fatG),
    fiberG: pick(data.fiberG, base.fiberG),
    sugarG: pick(data.sugarG, base.sugarG),
    saltG: pick(data.saltG, base.saltG),
  };

  return prisma.foodEntry.create({
    data: {
      eatenAt: at,
      day,
      productBarcode,
      customName,
      quantityG: data.quantityG,
      kcal: snap.kcal ?? 0,
      proteinG: snap.proteinG ?? 0,
      carbG: snap.carbG ?? 0,
      fatG: snap.fatG ?? 0,
      fiberG: snap.fiberG,
      sugarG: snap.sugarG,
      saltG: snap.saltG,
      meal: data.meal,
      origin,
      notes: data.notes,
    },
  });
}

/**
 * A day's food entries, newest first, each with its cached product's display
 * fields joined in (the UI shows the product name/thumbnail; barcode entries
 * carry no name of their own). The snapshotted macros on the row stay the source
 * of truth — the product join is for display only.
 */
export function listByDay(day: string = todayLocal()) {
  return prisma.foodEntry.findMany({
    where: { day: dayToDbDate(day) },
    orderBy: { eatenAt: "desc" },
    include: {
      product: { select: { name: true, brand: true, imageUrl: true } },
    },
  });
}

/**
 * A day's food entries, optionally narrowed to those whose custom name or cached
 * product name contains `query` (case-insensitive). Powers the MCP search_food_log
 * tool; with no query it behaves like listByDay.
 */
export function searchFoodLog(
  opts: { day?: string; query?: string } = {},
): Promise<FoodEntry[]> {
  const day = opts.day ?? todayLocal();
  const query = opts.query?.trim();
  return prisma.foodEntry.findMany({
    where: {
      day: dayToDbDate(day),
      ...(query
        ? {
            OR: [
              { customName: { contains: query, mode: "insensitive" } },
              { product: { name: { contains: query, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    orderBy: { eatenAt: "desc" },
  });
}

/** Delete an entry. UI-only — the MCP layer will not expose this. */
export async function deleteEntry(id: string): Promise<void> {
  try {
    await prisma.foodEntry.delete({ where: { id } });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2025"
    ) {
      throw new NotFoundError("food entry", id);
    }
    throw err;
  }
}
