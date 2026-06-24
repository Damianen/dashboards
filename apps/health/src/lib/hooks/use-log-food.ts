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

type Ctx = {
  prevEntries: FoodEntryDTO[] | undefined;
  prevSummary: DailySummary | null | undefined;
};

/** Logging while viewing a past day pins the entry to that day (UTC noon always
 *  lands inside the same Amsterdam civil day); today logs at "now". */
function eatenAtForDay(day: string): string | undefined {
  return day === todayLocal() ? undefined : `${day}T12:00:00.000Z`;
}

function tempId(): string {
  return `optimistic-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Log a food entry. Optimistically prepends the row to ["food", day] and bumps
 * the day's intake macros on the cached summary, rolls both back on error, and on
 * settle invalidates ["food", day] and ["summary", day].
 */
export function useLogFood(day: string) {
  const qc = useQueryClient();
  const foodKey = queryKeys.food(day);

  return useMutation({
    mutationFn: ({ input }: LogFoodArgs) =>
      postJSON("/api/food/entries", {
        ...input,
        eatenAt: input.eatenAt ?? eatenAtForDay(day),
      }),
    onMutate: async ({ input, preview }): Promise<Ctx> => {
      await qc.cancelQueries({ queryKey: foodKey });
      const prevEntries = qc.getQueryData<FoodEntryDTO[]>(foodKey);

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
        meal: preview.meal,
        product: input.barcode
          ? { name: preview.displayName, brand: null, imageUrl: preview.imageUrl }
          : null,
        customFood: input.customFoodId
          ? { name: preview.displayName, brand: null }
          : null,
      };
      qc.setQueryData<FoodEntryDTO[]>(foodKey, (cur) => [
        optimistic,
        ...(cur ?? []),
      ]);

      const prevSummary = await applyOptimisticSummary(qc, day, (s) => ({
        ...s,
        intakeKcal: (s.intakeKcal ?? 0) + preview.macros.kcal,
        proteinG: (s.proteinG ?? 0) + preview.macros.proteinG,
        carbG: (s.carbG ?? 0) + preview.macros.carbG,
        fatG: (s.fatG ?? 0) + preview.macros.fatG,
      }));

      return { prevEntries, prevSummary };
    },
    onError: (_err, _args, ctx) => {
      if (ctx?.prevEntries !== undefined) {
        qc.setQueryData(foodKey, ctx.prevEntries);
      }
      rollbackSummary(qc, day, ctx?.prevSummary);
      toast.error("Couldn't log food");
    },
    onSuccess: () => {
      toast.success("Food logged");
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: foodKey });
      void qc.invalidateQueries({ queryKey: queryKeys.summary(day) });
    },
  });
}
