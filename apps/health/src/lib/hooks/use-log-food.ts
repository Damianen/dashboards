"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { httpErrorMessage, postJSON } from "@/lib/fetcher";
import type { FoodEntryDTO, MacroTotals, MealSlot } from "@/lib/food";
import { queryKeys } from "@/lib/hooks/keys";
import {
  type DiaryCtx,
  eatenAtForDay,
  invalidateDiaryDay,
  prependOptimisticEntry,
  rollbackDiary,
  tempId,
} from "@/lib/hooks/optimistic-diary";
import type { LogFoodInput } from "@/lib/schemas/food";

/** Everything the diary needs to render the row optimistically, before the POST returns. */
export interface FoodPreview {
  displayName: string;
  imageUrl: string | null;
  quantityG: number;
  meal: MealSlot | null;
  /** Macros already coalesced to numbers (null → 0), matching how logFood persists. */
  macros: MacroTotals;
}

export interface LogFoodArgs {
  input: LogFoodInput;
  preview: FoodPreview;
}

/**
 * Log a food entry. Optimistically prepends the row to ["food", day] and bumps
 * the day's intake macros on the cached summary, rolls both back on error, and on
 * settle invalidates the day's diary-dependent reads plus the recents strip.
 */
export function useLogFood(day: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ input }: LogFoodArgs) =>
      postJSON("/api/food/entries", {
        ...input,
        eatenAt: input.eatenAt ?? eatenAtForDay(day),
      }),
    onMutate: async ({ input, preview }): Promise<DiaryCtx> => {
      const optimistic: FoodEntryDTO = {
        id: tempId(),
        eatenAt: eatenAtForDay(day) ?? new Date().toISOString(),
        productBarcode: input.barcode ?? null,
        customName: input.customName ?? null,
        mealId: null,
        portions: null,
        quantityG: String(preview.quantityG),
        kcal: String(preview.macros.kcal),
        proteinG: String(preview.macros.proteinG),
        carbG: String(preview.macros.carbG),
        fatG: String(preview.macros.fatG),
        fiberG: input.fiberG != null ? String(input.fiberG) : null,
        sugarG: input.sugarG != null ? String(input.sugarG) : null,
        saltG: input.saltG != null ? String(input.saltG) : null,
        meal: preview.meal,
        notes: input.notes ?? null,
        product: input.barcode
          ? { name: preview.displayName, brand: null, imageUrl: preview.imageUrl }
          : null,
        customFood: input.customFoodId
          ? { name: preview.displayName, brand: null }
          : null,
      };
      return prependOptimisticEntry(
        qc,
        day,
        optimistic,
        preview.macros,
        input.caffeineMg,
      );
    },
    onError: (err, _args, ctx) => {
      rollbackDiary(qc, day, ctx);
      toast.error(httpErrorMessage(err, "Couldn't log food"));
    },
    onSuccess: () => {
      toast.success("Food logged");
    },
    onSettled: () => {
      invalidateDiaryDay(qc, day);
      // Logging changes the recents order and last-used quantity.
      void qc.invalidateQueries({ queryKey: queryKeys.foodRecentPrefix() });
    },
  });
}
