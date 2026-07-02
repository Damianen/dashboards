"use client";

import { useState } from "react";

import { MealLogStep } from "@/components/food/meals/meal-log-step";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber } from "@/lib/format";
import { useMeals } from "@/lib/hooks/use-meals";
import type { MealSummary } from "@/server/services/meals";

/**
 * The Add-food sheet's "Meals" tab: pick a saved meal, then log it with a portion
 * stepper (the same inline MealLogStep the meals list uses). Manage recipes from the
 * Food page's Meals view.
 */
export function MealsAddTab({
  day,
  onLogged,
}: {
  day: string;
  onLogged: () => void;
}) {
  const { data, isLoading, isError, refetch } = useMeals();
  const meals = data ?? [];
  const [selected, setSelected] = useState<MealSummary | null>(null);

  if (selected) {
    return (
      <MealLogStep
        meal={selected}
        day={day}
        onLogged={onLogged}
        onBack={() => setSelected(null)}
      />
    );
  }

  return (
    <div className="max-h-[60dvh] space-y-1 overflow-y-auto">
      {isLoading ? (
        Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-md" />
        ))
      ) : isError ? (
        <div className="space-y-3 py-6 text-center">
          <p className="text-muted-foreground text-sm">
            Couldn&apos;t load meals.
          </p>
          <Button variant="outline" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      ) : meals.length === 0 ? (
        <p className="text-muted-foreground py-6 text-center text-sm">
          No saved meals yet. Create one in the Meals tab.
        </p>
      ) : (
        meals.map((meal) => (
          <button
            key={meal.id}
            type="button"
            onClick={() => setSelected(meal)}
            className="hover:bg-accent flex min-h-14 w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left transition-colors"
          >
            <div className="min-w-0">
              <div className="truncate font-medium">{meal.name}</div>
              <div className="text-muted-foreground text-xs tabular-nums">
                {formatNumber(meal.yieldPortions, 2)} portions
              </div>
            </div>
            <div className="shrink-0 text-right tabular-nums">
              <span className="font-semibold">
                {formatNumber(meal.perPortionKcal ?? 0)}
              </span>
              <span className="text-muted-foreground ml-1 text-xs">
                kcal/portion
              </span>
            </div>
          </button>
        ))
      )}
    </div>
  );
}
