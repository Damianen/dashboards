"use client";

import { MealLogStep } from "@/components/food/meals/meal-log-step";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import type { MealSummary } from "@/server/services/meals";

/** A bottom-sheet wrapper around MealLogStep, opened from the Meals list. */
export function MealLogSheet({
  open,
  onOpenChange,
  meal,
  day,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meal: MealSummary | null;
  day: string;
}) {
  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={meal ? `Log ${meal.name}` : "Log meal"}
      description="Pick a portion amount and log this meal to the diary."
      bodyClassName="space-y-4 overflow-y-auto"
    >
      {meal && (
        <MealLogStep meal={meal} day={day} onLogged={() => onOpenChange(false)} />
      )}
    </BottomSheet>
  );
}
