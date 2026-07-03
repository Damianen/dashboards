"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { delJSON, httpErrorMessage } from "@/lib/fetcher";
import type { FoodEntryDTO, FoodEntryView } from "@/lib/food";
import { queryKeys } from "@/lib/hooks/keys";
import {
  type DiaryCtx,
  invalidateDiaryDay,
  rollbackDiary,
} from "@/lib/hooks/optimistic-diary";
import { applyOptimisticSummary } from "@/lib/hooks/optimistic-summary";

/**
 * Delete a diary entry. Takes the resolved view so it can optimistically drop the
 * row from ["food", day] and subtract its macros from the cached summary; rolls
 * both back on error and invalidates the day's diary-dependent reads on settle.
 */
export function useDeleteFoodEntry(day: string) {
  const qc = useQueryClient();
  const foodKey = queryKeys.food(day);

  return useMutation({
    mutationFn: (entry: FoodEntryView) =>
      delJSON(`/api/food/entries/${encodeURIComponent(entry.id)}`),
    onMutate: async (entry): Promise<DiaryCtx> => {
      await qc.cancelQueries({ queryKey: foodKey });
      const prevEntries = qc.getQueryData<FoodEntryDTO[]>(foodKey);
      qc.setQueryData<FoodEntryDTO[]>(foodKey, (cur) =>
        (cur ?? []).filter((e) => e.id !== entry.id),
      );

      const prevSummary = await applyOptimisticSummary(qc, day, (s) => ({
        ...s,
        intakeKcal: Math.max(0, (s.intakeKcal ?? 0) - entry.kcal),
        proteinG: Math.max(0, (s.proteinG ?? 0) - entry.proteinG),
        carbG: Math.max(0, (s.carbG ?? 0) - entry.carbG),
        fatG: Math.max(0, (s.fatG ?? 0) - entry.fatG),
      }));

      return { prevEntries, prevSummary };
    },
    onError: (err, _entry, ctx) => {
      rollbackDiary(qc, day, ctx);
      toast.error(httpErrorMessage(err, "Couldn't delete entry"));
    },
    onSuccess: () => {
      toast.success("Entry deleted");
    },
    onSettled: () => {
      invalidateDiaryDay(qc, day);
      // Deleting the newest use changes the recents order / last-used quantity.
      void qc.invalidateQueries({ queryKey: queryKeys.foodRecentPrefix() });
    },
  });
}
