// Client-side state for the daily-plan builder: a PlanBuilderItem holds enough to
// live-preview each item's macro contribution AND to serialize back to the
// createDailyPlan input. Pure (no React/DB) so the sheet components stay thin. A plan
// item is a pure REFERENCE — applying it re-resolves CURRENT macros through
// logFood/logMeal — so a derived preview (edit mode) needn't be exact. Shares
// builderKey with the meal builder so list keys never collide.

import {
  coerceMacros,
  type MealSlot,
  type PickedItem,
  servingAmountG,
} from "@/lib/food";
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

/** Key-free projection of the items for change detection — the plan-builder sibling
 *  of builderSnapshot (see meal-builder.ts): `key` is minted fresh per mount, so a
 *  comparison including it would read an untouched form as changed. */
export function planSnapshot(items: PlanBuilderItem[]): string {
  return JSON.stringify(
    items.map((it) => ({
      name: it.name,
      amount: it.amount,
      mealSlot: it.mealSlot,
      source: it.source,
    })),
  );
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

/** Convert a picker selection into a fresh PlanBuilderItem (no slot yet): a
 *  product/saved food starts at its serving size (else 100 g), a meal at 1 portion.
 *  Plan items are pure references, so there is no "manual" case. */
export function planItemFromPicked(
  picked: Exclude<PickedItem, { kind: "manual" }>,
): PlanBuilderItem {
  switch (picked.kind) {
    case "product":
      return {
        key: builderKey(),
        name: picked.product.name,
        amount: servingAmountG(picked.product.servingG),
        mealSlot: null,
        source: {
          kind: "product",
          barcode: picked.product.barcode,
          per100g: picked.product.per100g,
        },
      };
    case "customFood":
      return {
        key: builderKey(),
        name: picked.food.name,
        amount: servingAmountG(picked.food.servingG),
        mealSlot: null,
        source: {
          kind: "customFood",
          customFoodId: picked.food.id,
          per100g: coerceMacros(picked.food.per100g),
        },
      };
    case "meal":
      return {
        key: builderKey(),
        name: picked.meal.name,
        amount: 1,
        mealSlot: null,
        source: {
          kind: "meal",
          mealId: picked.meal.id,
          perPortion: coerceMacros(picked.meal.perPortion),
        },
      };
  }
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
