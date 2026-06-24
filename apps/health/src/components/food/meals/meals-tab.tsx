"use client";

import { useState } from "react";
import { Pencil, Plus } from "lucide-react";

import { MealBuilderSheet } from "@/components/food/meals/meal-builder-sheet";
import { MealLogSheet } from "@/components/food/meals/meal-log-sheet";
import { EmptyState } from "@/components/today/metric-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber } from "@/lib/format";
import { useMeals } from "@/lib/hooks/use-meals";
import type { MealSummary } from "@/server/services/meals";

/**
 * The "Meals" view inside the Food page: saved recipes with their per-portion kcal.
 * Tap a meal to log it (portion stepper); the pencil edits the recipe; "New meal"
 * opens the builder.
 */
export function MealsTab({ day }: { day: string }) {
  const { data, isLoading, isError, isFetching, refetch } = useMeals();
  const meals = data ?? [];

  const [builderOpen, setBuilderOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [logTarget, setLogTarget] = useState<MealSummary | null>(null);

  function openNew() {
    setEditId(null);
    setBuilderOpen(true);
  }
  function openEdit(id: string) {
    setEditId(id);
    setBuilderOpen(true);
  }

  return (
    <div className="space-y-3">
      <Button className="h-12 w-full text-base" onClick={openNew}>
        <Plus className="size-5" aria-hidden />
        New meal
      </Button>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-md" />
          ))}
        </div>
      ) : isError ? (
        <div className="space-y-3 py-8 text-center">
          <p className="text-muted-foreground text-sm">Couldn&apos;t load meals.</p>
          <Button
            variant="outline"
            onClick={() => void refetch()}
            disabled={isFetching}
          >
            Retry
          </Button>
        </div>
      ) : meals.length === 0 ? (
        <div className="py-10 text-center">
          <EmptyState>No saved meals yet. Create one to log it fast.</EmptyState>
        </div>
      ) : (
        <ul className="space-y-2">
          {meals.map((meal) => (
            <li
              key={meal.id}
              className="bg-card flex items-center gap-2 rounded-md border pr-2"
            >
              <button
                type="button"
                onClick={() => setLogTarget(meal)}
                className="flex min-h-16 min-w-0 flex-1 items-center justify-between gap-3 px-3 py-2 text-left"
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
              <button
                type="button"
                aria-label={`Edit ${meal.name}`}
                onClick={() => openEdit(meal.id)}
                className="hover:bg-accent flex size-9 shrink-0 items-center justify-center rounded-md transition-colors"
              >
                <Pencil className="size-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      <MealBuilderSheet
        open={builderOpen}
        onOpenChange={setBuilderOpen}
        mealId={editId}
      />
      <MealLogSheet
        open={logTarget != null}
        onOpenChange={(next) => {
          if (!next) setLogTarget(null);
        }}
        meal={logTarget}
        day={day}
      />
    </div>
  );
}
