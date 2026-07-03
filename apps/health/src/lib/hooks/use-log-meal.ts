"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { httpErrorMessage, postJSON } from "@/lib/fetcher";
import type { FoodEntryDTO, MacroTotals, MealSlot } from "@/lib/food";
import {
  type DiaryCtx,
  eatenAtForDay,
  invalidateDiaryDay,
  prependOptimisticEntry,
  rollbackDiary,
  tempId,
} from "@/lib/hooks/optimistic-diary";

export interface LogMealArgs {
  mealId: string;
  portions: number;
  meal: MealSlot | null;
  /** The meal's name, shown on the optimistic diary row. */
  name: string;
  /** perPortion × portions, already coalesced to numbers (null → 0). */
  macros: MacroTotals;
}

/**
 * Log a saved meal as ONE combined diary entry. Optimistically prepends the row to
 * ["food", day] and bumps the day's intake macros, rolls both back on error, and on
 * settle invalidates the day's diary-dependent reads — exactly like useLogFood
 * (minus the recents strip: meal-logged entries don't appear in it).
 */
export function useLogMeal(day: string) {
  const qc = useQueryClient();

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
    }): Promise<DiaryCtx> => {
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
        fiberG: null,
        sugarG: null,
        saltG: null,
        meal,
        notes: null,
        product: null,
        customFood: null,
      };
      return prependOptimisticEntry(qc, day, optimistic, macros);
    },
    onError: (err, _args, ctx) => {
      rollbackDiary(qc, day, ctx);
      toast.error(httpErrorMessage(err, "Couldn't log meal"));
    },
    onSuccess: () => {
      toast.success("Meal logged");
    },
    onSettled: () => {
      invalidateDiaryDay(qc, day);
    },
  });
}
