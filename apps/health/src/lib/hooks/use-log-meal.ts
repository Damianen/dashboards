"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { todayLocal } from "@/lib/dates";
import { postJSON } from "@/lib/fetcher";
import type { FoodEntryDTO, MacroTotals, MealSlot } from "@/lib/food";
import { queryKeys } from "@/lib/hooks/keys";
import {
  applyOptimisticSummary,
  type DailySummary,
  rollbackSummary,
} from "@/lib/hooks/optimistic-summary";

export interface LogMealArgs {
  mealId: string;
  portions: number;
  meal: MealSlot | null;
  /** The meal's name, shown on the optimistic diary row. */
  name: string;
  /** perPortion × portions, already coalesced to numbers (null → 0). */
  macros: MacroTotals;
}

type Ctx = {
  prevEntries: FoodEntryDTO[] | undefined;
  prevSummary: DailySummary | null | undefined;
};

function eatenAtForDay(day: string): string | undefined {
  return day === todayLocal() ? undefined : `${day}T12:00:00.000Z`;
}

function tempId(): string {
  return `optimistic-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Log a saved meal as ONE combined diary entry. Optimistically prepends the row to
 * ["food", day] and bumps the day's intake macros, rolls both back on error, and on
 * settle invalidates ["food", day] and ["summary", day] — exactly like useLogFood.
 */
export function useLogMeal(day: string) {
  const qc = useQueryClient();
  const foodKey = queryKeys.food(day);

  return useMutation({
    mutationFn: ({ mealId, portions, meal }: LogMealArgs) =>
      postJSON(`/api/food/meals/${mealId}/log`, {
        portions,
        meal: meal ?? undefined,
        eatenAt: eatenAtForDay(day),
      }),
    onMutate: async ({
      mealId,
      portions,
      meal,
      name,
      macros,
    }): Promise<Ctx> => {
      await qc.cancelQueries({ queryKey: foodKey });
      const prevEntries = qc.getQueryData<FoodEntryDTO[]>(foodKey);

      const optimistic: FoodEntryDTO = {
        id: tempId(),
        eatenAt: eatenAtForDay(day) ?? new Date().toISOString(),
        productBarcode: null,
        customName: name,
        mealId,
        portions: String(portions),
        quantityG: null,
        kcal: String(macros.kcal),
        proteinG: String(macros.proteinG),
        carbG: String(macros.carbG),
        fatG: String(macros.fatG),
        meal,
        product: null,
        customFood: null,
      };
      qc.setQueryData<FoodEntryDTO[]>(foodKey, (cur) => [
        optimistic,
        ...(cur ?? []),
      ]);

      const prevSummary = await applyOptimisticSummary(qc, day, (s) => ({
        ...s,
        intakeKcal: (s.intakeKcal ?? 0) + macros.kcal,
        proteinG: (s.proteinG ?? 0) + macros.proteinG,
        carbG: (s.carbG ?? 0) + macros.carbG,
        fatG: (s.fatG ?? 0) + macros.fatG,
      }));

      return { prevEntries, prevSummary };
    },
    onError: (_err, _args, ctx) => {
      if (ctx?.prevEntries !== undefined) {
        qc.setQueryData(foodKey, ctx.prevEntries);
      }
      rollbackSummary(qc, day, ctx?.prevSummary);
      toast.error("Couldn't log meal");
    },
    onSuccess: () => {
      toast.success("Meal logged");
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: foodKey });
      void qc.invalidateQueries({ queryKey: queryKeys.summary(day) });
      // Today's intake/protein progress reads adherence, and a meal's caffeine
      // moves the water target — refresh both or those cards go stale.
      void qc.invalidateQueries({ queryKey: queryKeys.adherence(day) });
      void qc.invalidateQueries({ queryKey: queryKeys.water(day) });
    },
  });
}
