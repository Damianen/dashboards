"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { delJSON } from "@/lib/fetcher";
import type { FoodEntryDTO, FoodEntryView } from "@/lib/food";
import { queryKeys } from "@/lib/hooks/keys";
import {
  applyOptimisticSummary,
  type DailySummary,
  rollbackSummary,
} from "@/lib/hooks/optimistic-summary";

type Ctx = {
  prevEntries: FoodEntryDTO[] | undefined;
  prevSummary: DailySummary | null | undefined;
};

/**
 * Delete a diary entry. Takes the resolved view so it can optimistically drop the
 * row from ["food", day] and subtract its macros from the cached summary; rolls
 * both back on error and invalidates ["food", day] + ["summary", day] on settle.
 */
export function useDeleteFoodEntry(day: string) {
  const qc = useQueryClient();
  const foodKey = queryKeys.food(day);

  return useMutation({
    mutationFn: (entry: FoodEntryView) =>
      delJSON(`/api/food/entries/${encodeURIComponent(entry.id)}`),
    onMutate: async (entry): Promise<Ctx> => {
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
    onError: (_err, _entry, ctx) => {
      if (ctx?.prevEntries !== undefined) {
        qc.setQueryData(foodKey, ctx.prevEntries);
      }
      rollbackSummary(qc, day, ctx?.prevSummary);
      toast.error("Couldn't delete entry");
    },
    onSuccess: () => {
      toast.success("Entry deleted");
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: foodKey });
      void qc.invalidateQueries({ queryKey: queryKeys.summary(day) });
      // The deleted entry counted toward adherence, and its caffeine toward the
      // water target — refresh both or Today's cards go stale.
      void qc.invalidateQueries({ queryKey: queryKeys.adherence(day) });
      void qc.invalidateQueries({ queryKey: queryKeys.water(day) });
    },
  });
}
