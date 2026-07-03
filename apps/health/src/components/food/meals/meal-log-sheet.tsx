"use client";

import { FoodDialog } from "@/components/food/food-dialog";
import { MealLogStep } from "@/components/food/meals/meal-log-step";
import type { MealSummary } from "@/server/services/meals";

/** A dialog wrapper around MealLogStep, opened from the Meals list. */
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
    <FoodDialog
      open={open}
      onOpenChange={onOpenChange}
      title={meal ? `Log ${meal.name}` : "Log meal"}
      description="Pick a portion amount and log this meal to the diary."
      bodyClassName="space-y-4"
    >
      {meal && (
        <MealLogStep meal={meal} day={day} onLogged={() => onOpenChange(false)} />
      )}
    </FoodDialog>
  );
}
