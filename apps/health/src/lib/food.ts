// Client-safe presentation helpers for the food diary. No Prisma / server / DB
// imports — pure data shaping over what GET /api/food/entries returns, so it is
// unit-testable (CLAUDE.md "Definition of done"). The DTO mirrors the JSON wire
// shape: Prisma Decimal columns serialize to strings and dates to ISO strings,
// so `toView` is the single place those are coerced to numbers.

// Type-only import from the browser-safe enums module (a plain-object file with
// zero imports) — never from @/generated/prisma/client in client-reachable code.
import type { MealSlot as PrismaMealSlot } from "@/generated/prisma/enums";
import { round1 } from "@/lib/round";
import type { Macros } from "@/lib/rules";
import type { CreateCustomFoodInput } from "@/lib/schemas/food";
import type { MealSummary } from "@/server/services/meals";

/** A cached product as GET /api/food/products/{barcode} serializes it. */
export interface FoodProductDTO {
  barcode: string;
  name: string;
  brand: string | null;
  imageUrl: string | null;
  per100g: Macros;
  servingG: string | null;
}

/**
 * Anything the quantity step can log: a display head plus per-100g macros to scale,
 * and a `ref` saying which source resolves the entry server-side. A barcode product
 * and a saved custom food both reach the same step this way.
 */
export interface LoggableItem {
  name: string;
  brand: string | null;
  imageUrl: string | null;
  per100g: Macros;
  servingG: number | null;
  ref: { kind: "barcode"; barcode: string } | { kind: "customFood"; customFoodId: string };
}

/** Coerce a per-100g JSON object (camelCase keys, missing detail macros absent) into a
 *  full Macros with nulls for anything absent. Client-safe — used by the meal builder to
 *  scale a saved custom food, whose per100g optionals arrive as undefined. */
export function coerceMacros(p: Partial<Macros> | null | undefined): Macros {
  return {
    kcal: p?.kcal ?? null,
    proteinG: p?.proteinG ?? null,
    carbG: p?.carbG ?? null,
    fatG: p?.fatG ?? null,
    fiberG: p?.fiberG ?? null,
    sugarG: p?.sugarG ?? null,
    saltG: p?.saltG ?? null,
    caffeineMg: p?.caffeineMg ?? null,
  };
}

/**
 * What the shared FoodItemPicker hands back — one tab's selection, still in its
 * source DTO form. The meal/plan builders convert it to their own item shape via
 * builderItemFromPicked / planItemFromPicked ("manual" exists only where the
 * Manual tab is offered, i.e. the meal builder).
 */
export type PickedItem =
  | { kind: "product"; product: FoodProductDTO }
  | { kind: "customFood"; food: CustomFoodDTO }
  | { kind: "meal"; meal: MealSummary }
  | { kind: "manual"; name: string; macros: Macros };

/** Grams a picked product/saved food defaults to: its serving size when known and > 0, else 100 g.
 *  Accepts the wire string (Decimal) or number form. */
export function servingAmountG(
  servingG: string | number | null | undefined,
): number {
  return servingG != null && Number(servingG) > 0 ? Number(servingG) : 100;
}

/**
 * A saved custom food as GET /api/food/custom serializes it. `lastUsedAt` is the most
 * recent diary entry that used it (ISO, null if never), driving recently-used-first
 * order in the "My Foods" list. Decimals already coerced to numbers server-side.
 */
export interface CustomFoodDTO {
  id: string;
  name: string;
  brand: string | null;
  per100g: Macros;
  servingG: number | null;
  source: string;
  archived: boolean;
  lastUsedAt: string | null;
}

/**
 * Order saved foods recently-used first (never-used last), then name A→Z. ISO timestamps
 * compare lexicographically in chronological order, and "" (stand-in for never-used)
 * sorts below any real timestamp, so it lands last under the descending compare. Pure.
 */
export function compareCustomFoodRecency(
  a: { lastUsedAt: string | null; name: string },
  b: { lastUsedAt: string | null; name: string },
): number {
  const at = a.lastUsedAt ?? "";
  const bt = b.lastUsedAt ?? "";
  if (at !== bt) return at < bt ? 1 : -1;
  return a.name.localeCompare(b.name);
}

/** Adapt a saved custom food (per-100g) into a LoggableItem for the quantity step. */
export function customFoodToLoggable(food: CustomFoodDTO): LoggableItem {
  return {
    name: food.name,
    brand: food.brand,
    imageUrl: null,
    per100g: coerceMacros(food.per100g),
    servingG: food.servingG,
    ref: { kind: "customFood", customFoodId: food.id },
  };
}

/** Adapt a just-created custom food (its create input + new id) into a LoggableItem,
 *  so "save & log" can hand it straight to the quantity step without a re-fetch. */
export function customFoodInputToLoggable(
  input: CreateCustomFoodInput,
  id: string,
): LoggableItem {
  return {
    name: input.name,
    brand: input.brand ?? null,
    imageUrl: null,
    per100g: coerceMacros(input.per100g),
    servingG: input.servingG ?? null,
    ref: { kind: "customFood", customFoodId: id },
  };
}

/**
 * A recently-logged distinct food as GET /api/food/entries/recent serializes it:
 * ready to hand to the quantity step (or re-log instantly) plus the quantity the
 * user chose last time. `lastMeal` is display-only — instant re-logs use
 * suggestMeal(now) so an evening repeat of a lunch food lands in Dinner.
 */
export interface RecentLoggableDTO {
  loggable: LoggableItem;
  lastQuantityG: number;
  lastMeal: MealSlot | null;
  lastEatenAt: string;
}

/** Adapt a fetched product (Decimal servingG → number) into a LoggableItem. */
export function productToLoggable(product: FoodProductDTO): LoggableItem {
  return {
    name: product.name,
    brand: product.brand,
    imageUrl: product.imageUrl,
    per100g: product.per100g,
    servingG: product.servingG != null ? Number(product.servingG) : null,
    ref: { kind: "barcode", barcode: product.barcode },
  };
}

/** Diary slots in display order — pinned to the Prisma enum, so a schema change
 *  fails typecheck here (and in MEAL_LABELS) instead of silently drifting. */
export const MEAL_ORDER = [
  "BREAKFAST",
  "LUNCH",
  "DINNER",
  "SNACK",
] as const satisfies readonly PrismaMealSlot[];
export type MealSlot = (typeof MEAL_ORDER)[number];

export const MEAL_LABELS: Record<MealSlot, string> = {
  BREAKFAST: "Breakfast",
  LUNCH: "Lunch",
  DINNER: "Dinner",
  SNACK: "Snack",
};

/**
 * Suggest a meal slot from the time of day — only the default the picker opens
 * on; the user can always change it. Boundaries: <11 breakfast, <15 lunch,
 * <21 dinner, else snack. Uses the browser's local clock (Amsterdam for our
 * single user).
 */
export function suggestMeal(d: Date): MealSlot {
  const h = d.getHours();
  if (h < 11) return "BREAKFAST";
  if (h < 15) return "LUNCH";
  if (h < 21) return "DINNER";
  return "SNACK";
}

/** The product fields joined into each entry by listByDay (display only). */
export interface FoodEntryProductDTO {
  name: string;
  brand: string | null;
  imageUrl: string | null;
}

/** A food entry exactly as GET /api/food/entries serializes it (decimals → strings). */
export interface FoodEntryDTO {
  id: string;
  eatenAt: string;
  productBarcode: string | null;
  customName: string | null;
  /** Set when the entry was logged from a saved meal; `portions` is how many. */
  mealId: string | null;
  portions: string | null;
  /** Null for meal-logged entries (measured in portions, not grams). */
  quantityG: string | null;
  kcal: string;
  proteinG: string;
  carbG: string;
  fatG: string;
  /** Detail macros — null when the source didn't report them (never coerced to 0). */
  fiberG: string | null;
  sugarG: string | null;
  saltG: string | null;
  meal: MealSlot | null;
  /** Free-text note snapshotted at log time (e.g. AI-estimate assumptions). */
  notes: string | null;
  product: FoodEntryProductDTO | null;
  /** A saved custom food joined in for display (name/brand only — no image). */
  customFood: { name: string; brand: string | null } | null;
}

/** A diary entry ready to render: numeric macros + derived display fields. */
export interface FoodEntryView {
  id: string;
  eatenAt: string;
  meal: MealSlot | null;
  displayName: string;
  /** Null for meal-logged entries (measured in portions, not grams). */
  quantityG: number | null;
  /** A free-form (manually-typed) entry: macros are absolute, not per-100g, so the
   *  diary hides its gram count. Barcode and saved-custom-food entries are false. */
  isCustom: boolean;
  /** Portions logged when this entry came from a saved meal (else null); the row
   *  shows "<n> portions" in place of a gram count. */
  portions: number | null;
  kcal: number;
  proteinG: number;
  carbG: number;
  fatG: number;
  /** Detail macros — null when the source didn't report them. */
  fiberG: number | null;
  sugarG: number | null;
  saltG: number | null;
  /** Free-text note snapshotted at log time (e.g. AI-estimate assumptions). */
  notes: string | null;
}

/** The four macro totals shown on the day bar and each meal subtotal. */
export interface MacroTotals {
  kcal: number;
  proteinG: number;
  carbG: number;
  fatG: number;
}

/** Coerce a wire DTO into a render-ready view — the one Decimal→number chokepoint. */
export function toView(dto: FoodEntryDTO): FoodEntryView {
  return {
    id: dto.id,
    eatenAt: dto.eatenAt,
    meal: dto.meal,
    displayName:
      dto.product?.name ??
      dto.customFood?.name ??
      dto.customName ??
      dto.productBarcode ??
      "Food",
    quantityG: dto.quantityG != null ? Number(dto.quantityG) : null,
    isCustom: dto.customName != null,
    portions: dto.portions != null ? Number(dto.portions) : null,
    kcal: Number(dto.kcal),
    proteinG: Number(dto.proteinG),
    carbG: Number(dto.carbG),
    fatG: Number(dto.fatG),
    fiberG: dto.fiberG != null ? Number(dto.fiberG) : null,
    sugarG: dto.sugarG != null ? Number(dto.sugarG) : null,
    saltG: dto.saltG != null ? Number(dto.saltG) : null,
    notes: dto.notes,
  };
}

/** Detail-macro totals for the day bar's expanded row. A field is null (shown
 *  "—") only when NO entry carries it; otherwise nulls sum as 0. */
export interface DetailTotals {
  fiberG: number | null;
  sugarG: number | null;
  saltG: number | null;
}

/** Σ of the detail macros over a set of entries (see DetailTotals for null rules). */
export function detailTotal(views: FoodEntryView[]): DetailTotals {
  const sum = (pick: (v: FoodEntryView) => number | null): number | null => {
    let total = 0;
    let seen = false;
    for (const v of views) {
      const value = pick(v);
      if (value != null) {
        total += value;
        seen = true;
      }
    }
    return seen ? total : null;
  };
  return {
    fiberG: sum((v) => v.fiberG),
    sugarG: sum((v) => v.sugarG),
    saltG: sum((v) => v.saltG),
  };
}

/** The full macro snapshot a FoodEntry stores, as numbers. Null = the source
 *  didn't report that field (the four energy macros are always present). */
export interface EntryTotals {
  kcal: number;
  proteinG: number;
  carbG: number;
  fatG: number;
  fiberG: number | null;
  sugarG: number | null;
  saltG: number | null;
  caffeineMg: number | null;
}

/**
 * Rescale an entry's OWN stored totals to a new quantity: per-unit = totals ÷
 * stored quantity, so each value scales by newQuantityG/storedQuantityG, rounded
 * to 1 dp (the scaleMacros idiom). Nulls stay null. This is the snapshot rule's
 * edit path — the product/custom-food cache is never consulted, so an edit can
 * never rewrite history from changed cache data.
 */
export function rescaleEntryTotals(
  stored: EntryTotals,
  storedQuantityG: number,
  newQuantityG: number,
): EntryTotals {
  const factor = newQuantityG / storedQuantityG;
  const scale = (v: number | null) => (v == null ? null : round1(v * factor));
  return {
    kcal: round1(stored.kcal * factor),
    proteinG: round1(stored.proteinG * factor),
    carbG: round1(stored.carbG * factor),
    fatG: round1(stored.fatG * factor),
    fiberG: scale(stored.fiberG),
    sugarG: scale(stored.sugarG),
    saltG: scale(stored.saltG),
    caffeineMg: scale(stored.caffeineMg),
  };
}

/** Σ of the four day-summary macros over a set of entries. */
export function dayTotal(views: FoodEntryView[]): MacroTotals {
  return views.reduce<MacroTotals>(
    (t, v) => ({
      kcal: t.kcal + v.kcal,
      proteinG: t.proteinG + v.proteinG,
      carbG: t.carbG + v.carbG,
      fatG: t.fatG + v.fatG,
    }),
    { kcal: 0, proteinG: 0, carbG: 0, fatG: 0 },
  );
}

export interface MealGroup {
  meal: MealSlot | null;
  label: string;
  entries: FoodEntryView[];
  subtotal: MacroTotals;
}

/**
 * Group entries by meal slot in MEAL_ORDER, dropping empty groups and keeping
 * each entry's incoming order (the API already returns them eatenAt-desc).
 * Entries with no meal fall into a trailing "Other" group.
 */
export function groupByMeal(views: FoodEntryView[]): MealGroup[] {
  const groups: MealGroup[] = [];
  const bucket = (meal: MealSlot | null, label: string) => {
    const entries = views.filter((v) => v.meal === meal);
    if (entries.length > 0) {
      groups.push({ meal, label, entries, subtotal: dayTotal(entries) });
    }
  };
  for (const meal of MEAL_ORDER) bucket(meal, MEAL_LABELS[meal]);
  bucket(null, "Other");
  return groups;
}
