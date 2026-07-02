import {
  type CustomFood,
  EntryOrigin,
  type FoodEntry,
  type FoodProduct,
  Prisma,
} from "@/generated/prisma/client";
import { dayOf, dayToDbDate, todayLocal } from "@/lib/dates";
import { compareCustomFoodRecency, type CustomFoodDTO } from "@/lib/food";
import {
  type LabelNutrients,
  type Macros,
  normalizeToPer100g,
  scaleMacros,
  sumMealTotals,
} from "@/lib/rules";
import {
  type CreateCustomFoodInput,
  createCustomFoodSchema,
  type LogFoodInput,
  logFoodSchema,
  type Per100g,
  type UpdateCustomFoodInput,
  updateCustomFoodSchema,
} from "@/lib/schemas/food";
import {
  labelScanResultSchema,
  type MealEstimate,
  mealEstimateSchema,
} from "@/lib/schemas/vision";
import { prisma } from "@/server/db";
import { NotFoundError } from "./errors";
import { fetchProduct } from "./off";
import { analyzeImage } from "./vision";

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

/** Read our normalized per-100g macros back off a per100g JSON column (a cached
 *  product or a saved custom food). Missing keys → null, never 0. */
export function macrosFromJson(json: Prisma.JsonValue): Macros {
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
    caffeineMg: num("caffeineMg"),
  };
}

/** Read our normalized per-100g macros back off a cached product's JSON column. */
export function macrosFromProduct(product: FoodProduct): Macros {
  return macrosFromJson(product.per100g);
}

/**
 * Create a reusable saved food (a home recipe, or a confirmed label scan). The
 * per-100g macros are stored verbatim so logFood can scale them by quantity at
 * log time, exactly like an OFF product — but these are entirely user-owned and
 * never touched by the OFF cache.
 */
export async function createCustomFood(
  input: CreateCustomFoodInput,
): Promise<CustomFood> {
  const data = createCustomFoodSchema.parse(input);
  return prisma.customFood.create({
    data: {
      name: data.name,
      brand: data.brand ?? null,
      per100g: data.per100g as unknown as Prisma.InputJsonValue,
      servingG: data.servingG ?? null,
      source: data.source,
    },
  });
}

// The vision instruction for a nutrition-label photo. Drives the read toward our
// per-100g model: prefer per-100g, fall back to per-serving + size, kcal not kJ,
// and — critically — null (never a guessed number) for anything not printed.
const LABEL_SCAN_INSTRUCTION =
  "Read this nutrition label. Extract the product name and brand if visible, the " +
  "serving size in grams, and the nutrition values. Report values per 100 g if the " +
  "label gives them; otherwise report per serving and include the serving size. " +
  "Energy in kcal (convert from kJ if only kJ is shown: kcal = kJ / 4.184). Use null " +
  "for anything not printed — never guess a number. Rate your confidence.";

/** A confirm-before-save draft built from a label scan: a createCustomFood-shaped
 *  object (source LABEL_SCAN). per100g is null when the label gave neither a
 *  per-100g block nor a usable serving size — the UI then starts those fields empty. */
export interface LabelScanDraft {
  name: string;
  brand?: string;
  servingG?: number;
  per100g: Per100g | null;
  source: "LABEL_SCAN";
}

export interface LabelScanResponse {
  draft: LabelScanDraft;
  confidence: "high" | "medium" | "low";
  notes: string;
}

/** Drop unreported (null) detail macros so the result satisfies per100gSchema,
 *  whose optionals are `number | undefined`, never null. */
function toPer100gInput(n: LabelNutrients): Per100g {
  return {
    kcal: n.kcal,
    proteinG: n.proteinG,
    carbG: n.carbG,
    fatG: n.fatG,
    ...(n.fiberG != null ? { fiberG: n.fiberG } : {}),
    ...(n.sugarG != null ? { sugarG: n.sugarG } : {}),
    ...(n.saltG != null ? { saltG: n.saltG } : {}),
  };
}

/**
 * Read a nutrition-label photo into a DRAFT custom food the caller must confirm —
 * NO side effects (CLAUDE.md: vision endpoints return drafts, persisting is a
 * separate explicit call via createCustomFood/logFood). The image is analyzed,
 * validated against labelScanResultSchema, then reduced to per-100g macros
 * (normalizeToPer100g handles a per-serving-only label). Throws VisionError on a
 * provider/parse failure — the caller surfaces it without leaking internals.
 */
export async function scanLabel(
  imageDataUrl: string,
): Promise<LabelScanResponse> {
  const read = await analyzeImage({
    imageDataUrl,
    instruction: LABEL_SCAN_INSTRUCTION,
    schema: labelScanResultSchema,
  });
  const per100g = normalizeToPer100g({
    servingSizeG: read.servingSizeG,
    per100g: read.per100g,
    perServing: read.perServing,
  });
  const draft: LabelScanDraft = {
    name: read.name,
    ...(read.brand ? { brand: read.brand } : {}),
    ...(read.servingSizeG != null ? { servingG: read.servingSizeG } : {}),
    per100g: per100g ? toPer100gInput(per100g) : null,
    source: "LABEL_SCAN",
  };
  return { draft, confidence: read.confidence, notes: read.notes };
}

// The vision instruction for a meal/plate photo — the restaurant / no-label
// fallback. Drives a per-component breakdown (weight + macros) plus the model's
// own assumptions and a caveat, biased toward honest, conservative uncertainty.
const MEAL_ESTIMATE_INSTRUCTION =
  "Estimate the food in this photo for calorie tracking. Identify each distinct " +
  "component, estimate its weight in grams, and its kcal, protein, carbs and fat. " +
  "Sum them into totals. State the assumptions you made (cooking oil, portion size, " +
  "hidden ingredients) and a one-line caveat that this is a rough estimate. Be " +
  "conservative and honest about uncertainty; most plates warrant 'low' or 'medium' " +
  "confidence. Energy in kcal.";

/**
 * Estimate a meal/plate photo into a DRAFT the caller must confirm — NO side
 * effects (CLAUDE.md: vision endpoints return drafts; persisting is a separate
 * explicit call via logFood). The image is analyzed and validated against
 * mealEstimateSchema, then the four totals are recomputed from the components so
 * they always match the parts even if the model's sums drift. These are ROUGH
 * estimates: the UI/MCP label them 'AI estimate' and surface the model's
 * confidence, assumptions and caveat. Throws VisionError on a provider/parse
 * failure — the caller surfaces it without leaking internals.
 */
export async function estimateMeal(
  imageDataUrl: string,
): Promise<MealEstimate> {
  const read = await analyzeImage({
    imageDataUrl,
    instruction: MEAL_ESTIMATE_INSTRUCTION,
    schema: mealEstimateSchema,
    maxTokens: 1500,
  });
  return { ...read, ...sumMealTotals(read.components) };
}

/** Shape a stored custom food (+ its most recent use) into the picker/list DTO:
 *  Decimal serving → number, per100g read back as full Macros, dates → ISO. */
function serializeCustomFood(
  food: CustomFood,
  lastUsedAt: Date | null,
): CustomFoodDTO {
  return {
    id: food.id,
    name: food.name,
    brand: food.brand,
    per100g: macrosFromJson(food.per100g),
    servingG: food.servingG != null ? Number(food.servingG) : null,
    source: food.source,
    archived: food.archived,
    lastUsedAt: lastUsedAt?.toISOString() ?? null,
  };
}

/**
 * Saved custom foods for the "My Foods" picker, recently-used first (never-used last),
 * then name. `q` filters name/brand (case-insensitive); archived foods are excluded
 * unless `includeArchived`. Each row carries its most-recent diary use so the list
 * surfaces what's actually eaten.
 */
export async function listCustomFoods(
  opts: { q?: string; includeArchived?: boolean } = {},
): Promise<CustomFoodDTO[]> {
  const q = opts.q?.trim();
  const rows = await prisma.customFood.findMany({
    where: {
      ...(opts.includeArchived ? {} : { archived: false }),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { brand: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: {
      entries: {
        orderBy: { eatenAt: "desc" },
        take: 1,
        select: { eatenAt: true },
      },
    },
  });
  return rows
    .map(({ entries, ...food }) =>
      serializeCustomFood(food, entries[0]?.eatenAt ?? null),
    )
    .sort(compareCustomFoodRecency);
}

/**
 * Saved custom foods whose name or brand contains `query` (case-insensitive), EXCLUDING
 * archived (retired) foods so a retired food is never logged afresh. An empty query lists
 * all active foods. Powers the MCP custom_food_name resolution (log_food / create_meal).
 */
export function searchCustomFoods(query: string): Promise<CustomFood[]> {
  const q = query.trim();
  return prisma.customFood.findMany({
    where: {
      archived: false,
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { brand: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { name: "asc" },
  });
}

/** A single saved custom food; 404s if it doesn't exist. */
export async function getCustomFood(id: string): Promise<CustomFood> {
  const food = await prisma.customFood.findUnique({ where: { id } });
  if (!food) throw new NotFoundError("custom food", id);
  return food;
}

/**
 * Edit a saved food's name/brand/per-100g macros/serving. Source is immutable and the
 * archived flag toggles separately. Past diary entries snapshot their macros, so an edit
 * never rewrites history (CLAUDE.md). 404s if the food doesn't exist.
 */
export async function updateCustomFood(
  id: string,
  input: UpdateCustomFoodInput,
): Promise<CustomFood> {
  const data = updateCustomFoodSchema.parse(input);
  try {
    return await prisma.customFood.update({
      where: { id },
      data: {
        name: data.name,
        brand: data.brand ?? null,
        per100g: data.per100g as unknown as Prisma.InputJsonValue,
        servingG: data.servingG ?? null,
      },
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2025"
    ) {
      throw new NotFoundError("custom food", id);
    }
    throw err;
  }
}

/**
 * Archive (retire from the active list) or restore a saved food. While archived it's
 * hidden from the picker and from MCP name resolution; past diary entries are untouched.
 * 404s if the food doesn't exist.
 */
export async function setCustomFoodArchived(
  id: string,
  archived: boolean,
): Promise<CustomFood> {
  try {
    return await prisma.customFood.update({
      where: { id },
      data: { archived },
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2025"
    ) {
      throw new NotFoundError("custom food", id);
    }
    throw err;
  }
}

/**
 * Log a food entry, SNAPSHOTTING its macros at log time (CLAUDE.md: history never
 * recomputes from the cache). Exactly one source resolves the macros: a `barcode`
 * through the product cache, a `customFoodId` through a saved custom food (both
 * scaled by quantity), or a free-form `customName` + `kcal`. Explicit macro
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
  let customFoodId: string | null = null;
  let customName: string | null = null;

  if (data.barcode != null) {
    const product = await getOrFetchProduct(data.barcode);
    if (!product) throw new NotFoundError("product", data.barcode);
    productBarcode = product.barcode;
    base = scaleMacros(macrosFromProduct(product), data.quantityG);
  } else if (data.customFoodId != null) {
    const food = await prisma.customFood.findUnique({
      where: { id: data.customFoodId },
    });
    if (!food) throw new NotFoundError("custom food", data.customFoodId);
    customFoodId = food.id;
    base = scaleMacros(macrosFromJson(food.per100g), data.quantityG);
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
      caffeineMg: null,
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
    caffeineMg: pick(data.caffeineMg, base.caffeineMg),
  };

  return prisma.foodEntry.create({
    data: {
      eatenAt: at,
      day,
      productBarcode,
      customFoodId,
      customName,
      quantityG: data.quantityG,
      kcal: snap.kcal ?? 0,
      proteinG: snap.proteinG ?? 0,
      carbG: snap.carbG ?? 0,
      fatG: snap.fatG ?? 0,
      fiberG: snap.fiberG,
      sugarG: snap.sugarG,
      saltG: snap.saltG,
      // Caffeine is snapshotted but kept null when unknown — never coerced to 0
      // (the daily_summary view COALESCEs it in the unified caffeine SUM). It feeds
      // only the water-target rule, never any calorie column.
      caffeineMg: snap.caffeineMg,
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
      customFood: { select: { name: true, brand: true } },
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
