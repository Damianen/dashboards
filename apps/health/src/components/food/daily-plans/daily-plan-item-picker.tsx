"use client";

import { FoodItemPicker, type PickerTab } from "@/components/food/item-picker";
import {
  type PlanBuilderItem,
  planItemFromPicked,
} from "@/lib/daily-plan-builder";

const TABS: readonly PickerTab[] = ["search", "scan", "saved", "meal"];

/**
 * The "add an item" step of the daily-plan builder: the shared FoodItemPicker
 * without a Manual tab (plan items are pure references), converting each pick
 * to a PlanBuilderItem.
 */
export function DailyPlanItemPicker({
  onAdd,
  onCancel,
}: {
  onAdd: (item: PlanBuilderItem) => void;
  onCancel: () => void;
}) {
  return (
    <FoodItemPicker
      title="Add item"
      tabs={TABS}
      tabsAriaLabel="Item source"
      mealTabHint="A meal logs as one combined entry, scaled by its portion count."
      mealTabEmpty="No saved meals yet."
      productNotFoundMessage="Product not found — save it as a custom food first"
      onCancel={onCancel}
      onPick={(picked) => {
        // Unreachable: this picker offers no Manual tab. Narrows for the converter.
        if (picked.kind === "manual") return;
        onAdd(planItemFromPicked(picked));
      }}
    />
  );
}
