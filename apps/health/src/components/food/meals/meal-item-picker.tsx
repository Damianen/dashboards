"use client";

import { FoodItemPicker, type PickerTab } from "@/components/food/item-picker";
import { type BuilderItem, builderItemFromPicked } from "@/lib/meal-builder";

const TABS: readonly PickerTab[] = ["search", "scan", "saved", "manual", "meal"];

/**
 * The "add an ingredient" step of the meal builder: the shared FoodItemPicker
 * with the full tab set (incl. free-typed Manual items), converting each pick
 * to a BuilderItem. `excludeMealId` hides the meal being edited from the nest
 * list.
 */
export function MealItemPicker({
  onAdd,
  onCancel,
  excludeMealId,
}: {
  onAdd: (item: BuilderItem) => void;
  onCancel: () => void;
  excludeMealId?: string;
}) {
  return (
    <FoodItemPicker
      title="Add ingredient"
      tabs={TABS}
      tabsAriaLabel="Ingredient source"
      excludeMealId={excludeMealId}
      mealTabHint="Nested meals fold in their current per-portion macros at save time."
      mealTabEmpty="No other meals to nest."
      productNotFoundMessage="Product not found — try the Manual tab"
      onCancel={onCancel}
      onPick={(picked) => onAdd(builderItemFromPicked(picked))}
    />
  );
}
