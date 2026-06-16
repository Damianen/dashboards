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
  quantityG: string;
  kcal: string;
  proteinG: string;
  carbG: string;
  fatG: string;
  meal: MealSlot | null;
  product: FoodEntryProductDTO | null;
}

/** A diary entry ready to render: numeric macros + derived display fields. */
export interface FoodEntryView {
  id: string;
  eatenAt: string;
  meal: MealSlot | null;
  displayName: string;
  quantityG: number;
  /** Custom (manually-typed) entries have no product, so we hide the gram count. */
  isCustom: boolean;
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
      dto.product?.name ?? dto.customName ?? dto.productBarcode ?? "Food",
    quantityG: Number(dto.quantityG),
    isCustom: dto.productBarcode == null,
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
