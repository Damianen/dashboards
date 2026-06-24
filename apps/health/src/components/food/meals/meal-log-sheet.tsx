"use client";

import { Drawer } from "vaul";

import { MealLogStep } from "@/components/food/meals/meal-log-step";
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
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <Drawer.Content
          className="bg-card fixed inset-x-0 bottom-0 z-50 mt-24 flex max-h-[90dvh] flex-col rounded-t-2xl border-t outline-none"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <div className="bg-muted mx-auto mt-3 h-1.5 w-10 shrink-0 rounded-full" />
          <div className="mx-auto w-full max-w-md space-y-4 overflow-y-auto p-4">
            <Drawer.Title className="sr-only">
              {meal ? `Log ${meal.name}` : "Log meal"}
            </Drawer.Title>
            <Drawer.Description className="sr-only">
              Pick a portion amount and log this meal to the diary.
            </Drawer.Description>
            {meal && (
              <MealLogStep
                meal={meal}
                day={day}
                onLogged={() => onOpenChange(false)}
              />
            )}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
