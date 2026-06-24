// Client-side state for the meal builder: a BuilderItem holds enough to live-preview
// each ingredient's macro contribution AND to serialize back to the createMeal input.
// Pure (no React/DB) so the sheet components stay thin. The server re-resolves every
// item from its CURRENT source on save, so a derived preview (edit mode) needn't be exact.

import { computeMealMacros, scaleMacrosBy } from "@/lib/meals";
import { type Macros, scaleMacros } from "@/lib/rules";
import type { CreateMealInput, MealItemInput } from "@/lib/schemas/meals";
import type { MealItemView } from "@/server/services/meals";

export type BuilderSource =
  | { kind: "product"; barcode: string; per100g: Macros }
  | { kind: "customFood"; customFoodId: string; per100g: Macros }
  | { kind: "free"; macros: Macros }
  | { kind: "childMeal"; childMealId: string; perPortion: Macros };

export interface BuilderItem {
  /** Stable React key for the list (not persisted). */
  key: string;
  name: string;
  source: BuilderSource;
  /** Grams for product/customFood/free; portions for a nested childMeal. */
  amount: number;
}

let seq = 0;
export function builderKey(): string {
  seq += 1;
  return `bi-${seq}`;
}

/** This item's macro contribution to the meal total. Free items are absolute (their
 *  entered macros); the rest scale by amount. Nulls are preserved. */
export function itemContribution(item: BuilderItem): Macros {
  const s = item.source;
  switch (s.kind) {
    case "product":
    case "customFood":
      return scaleMacros(s.per100g, item.amount);
    case "free":
      return s.macros;
    case "childMeal":
      return scaleMacrosBy(s.perPortion, item.amount);
  }
}

/** Live total + per-portion macros for the builder preview. */
export function builderTotals(
  items: BuilderItem[],
  yieldPortions: number,
): { total: Macros; perPortion: Macros } {
  return computeMealMacros(
    items.map(itemContribution),
    yieldPortions > 0 ? yieldPortions : 1,
  );
}

/** Rebuild a BuilderItem from a saved item for edit mode, deriving the per-unit macros
 *  from the stored contribution snapshot so the preview and amount controls still work. */
export function builderItemFromView(it: MealItemView): BuilderItem {
  const m = it.macros;
  if (it.productBarcode != null) {
    const amount = it.quantityG ?? 100;
    return {
      key: builderKey(),
      name: it.displayName,
      amount,
      source: {
        kind: "product",
        barcode: it.productBarcode,
        per100g: scaleMacrosBy(m, amount > 0 ? 100 / amount : 0),
      },
    };
  }
  if (it.customFoodId != null) {
    const amount = it.quantityG ?? 100;
    return {
      key: builderKey(),
      name: it.displayName,
      amount,
      source: {
        kind: "customFood",
        customFoodId: it.customFoodId,
        per100g: scaleMacrosBy(m, amount > 0 ? 100 / amount : 0),
      },
    };
  }
  if (it.childMealId != null) {
    const amount = it.childPortions ?? 1;
    return {
      key: builderKey(),
      name: it.displayName,
      amount,
      source: {
        kind: "childMeal",
        childMealId: it.childMealId,
        perPortion: scaleMacrosBy(m, amount > 0 ? 1 / amount : 0),
      },
    };
  }
  return {
    key: builderKey(),
    name: it.displayName,
    amount: it.quantityG ?? 0,
    source: { kind: "free", macros: m },
  };
}

function macroFields(m: Macros): Partial<MealItemInput> {
  return {
    ...(m.proteinG != null ? { proteinG: m.proteinG } : {}),
    ...(m.carbG != null ? { carbG: m.carbG } : {}),
    ...(m.fatG != null ? { fatG: m.fatG } : {}),
    ...(m.fiberG != null ? { fiberG: m.fiberG } : {}),
    ...(m.sugarG != null ? { sugarG: m.sugarG } : {}),
    ...(m.saltG != null ? { saltG: m.saltG } : {}),
  };
}

/** Serialize a BuilderItem to the createMeal item input the server validates. */
export function toMealItemInput(item: BuilderItem): MealItemInput {
  const s = item.source;
  switch (s.kind) {
    case "product":
      return { barcode: s.barcode, quantityG: item.amount };
    case "customFood":
      return { customFoodId: s.customFoodId, quantityG: item.amount };
    case "childMeal":
      return { childMealId: s.childMealId, childPortions: item.amount };
    case "free":
      return {
        customName: item.name,
        ...(item.amount > 0 ? { quantityG: item.amount } : {}),
        kcal: s.macros.kcal ?? 0,
        ...macroFields(s.macros),
      };
  }
}

export function toCreateMealInput(
  name: string,
  yieldPortions: number,
  notes: string,
  items: BuilderItem[],
): CreateMealInput {
  return {
    name: name.trim(),
    ...(notes.trim() !== "" ? { notes: notes.trim() } : {}),
    yieldPortions,
    items: items.map(toMealItemInput),
  };
}
