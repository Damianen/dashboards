// Client-safe presentation helpers for the food diary. No Prisma / server / DB
// imports — pure data shaping over what GET /api/food/entries returns, so it is
// unit-testable (CLAUDE.md "Definition of done"). The DTO mirrors the JSON wire
// shape: Prisma Decimal columns serialize to strings and dates to ISO strings,
// so `toView` is the single place those are coerced to numbers.

import type { Macros } from "@/lib/rules";

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

export const MEAL_ORDER = ["BREAKFAST", "LUNCH", "DINNER", "SNACK"] as const;
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
  meal: MealSlot | null;
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
