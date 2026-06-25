// Client-side state for the daily-plan builder: a PlanBuilderItem holds enough to
// live-preview each item's macro contribution AND to serialize back to the
// createDailyPlan input. Pure (no React/DB) so the sheet components stay thin. A plan
// item is a pure REFERENCE — applying it re-resolves CURRENT macros through
// logFood/logMeal — so a derived preview (edit mode) needn't be exact. Shares
// builderKey with the meal builder so list keys never collide.

import { type MealSlot } from "@/lib/food";
import { builderKey } from "@/lib/meal-builder";
import { scaleMacrosBy, sumMacros } from "@/lib/meals";
import { type Macros, scaleMacros } from "@/lib/rules";
import type {
  CreateDailyPlanInput,
  DailyPlanItemInput,
} from "@/lib/schemas/daily-plans";
import type { DailyPlanItemView } from "@/server/services/dailyPlans";

export type PlanBuilderSource =
  | { kind: "product"; barcode: string; per100g: Macros }
  | { kind: "customFood"; customFoodId: string; per100g: Macros }
  | { kind: "meal"; mealId: string; perPortion: Macros };

export interface PlanBuilderItem {
  /** Stable React key for the list (not persisted). */
  key: string;
  name: string;
  source: PlanBuilderSource;
  /** Grams for product/customFood; portions for a meal. */
  amount: number;
  /** Optional diary slot the applied entry lands in (null = no slot → "Other"). */
  mealSlot: MealSlot | null;
}

export { builderKey };

/** This item's macro contribution: product/custom food scale per-100 g by grams; a
 *  meal scales per-portion by portions. Nulls are preserved. */
export function itemContribution(item: PlanBuilderItem): Macros {
  const s = item.source;
  switch (s.kind) {
    case "product":
    case "customFood":
      return scaleMacros(s.per100g, item.amount);
    case "meal":
      return scaleMacrosBy(s.perPortion, item.amount);
  }
}

/** Live total macros for the builder preview (Σ of item contributions). */
export function planTotal(items: PlanBuilderItem[]): Macros {
  return sumMacros(items.map(itemContribution));
}

/** Rebuild a PlanBuilderItem from a saved item for edit mode, deriving the per-unit
 *  macros from the resolved contribution so the preview and amount controls work. */
export function planItemFromView(it: DailyPlanItemView): PlanBuilderItem {
  const m = it.macros;
  if (it.productBarcode != null) {
    const amount = it.quantityG ?? 100;
    return {
      key: builderKey(),
      name: it.displayName,
      amount,
      mealSlot: it.mealSlot,
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
      mealSlot: it.mealSlot,
      source: {
        kind: "customFood",
        customFoodId: it.customFoodId,
        per100g: scaleMacrosBy(m, amount > 0 ? 100 / amount : 0),
      },
    };
  }
  const amount = it.portions ?? 1;
  return {
    key: builderKey(),
    name: it.displayName,
    amount,
    mealSlot: it.mealSlot,
    source: {
      kind: "meal",
      mealId: it.mealId ?? "",
      perPortion: scaleMacrosBy(m, amount > 0 ? 1 / amount : 0),
    },
  };
}

/** Serialize a PlanBuilderItem to the createDailyPlan item input the server validates. */
export function toDailyPlanItemInput(item: PlanBuilderItem): DailyPlanItemInput {
  const s = item.source;
  const slot = item.mealSlot ?? undefined;
  switch (s.kind) {
    case "product":
      return {
        barcode: s.barcode,
        quantityG: item.amount,
        ...(slot ? { mealSlot: slot } : {}),
      };
    case "customFood":
      return {
        customFoodId: s.customFoodId,
        quantityG: item.amount,
        ...(slot ? { mealSlot: slot } : {}),
      };
    case "meal":
      return {
        mealId: s.mealId,
        portions: item.amount,
        ...(slot ? { mealSlot: slot } : {}),
      };
  }
}

export function toCreateDailyPlanInput(
  name: string,
  notes: string,
  items: PlanBuilderItem[],
): CreateDailyPlanInput {
  return {
    name: name.trim(),
    ...(notes.trim() !== "" ? { notes: notes.trim() } : {}),
    items: items.map(toDailyPlanItemInput),
  };
}
