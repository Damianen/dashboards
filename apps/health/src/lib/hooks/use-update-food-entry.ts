"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { patchJSON } from "@/lib/fetcher";
import {
  type EntryTotals,
  type FoodEntryDTO,
  type FoodEntryView,
  rescaleEntryTotals,
} from "@/lib/food";
import { queryKeys } from "@/lib/hooks/keys";
import {
  type DiaryCtx,
  invalidateDiaryDay,
  rollbackDiary,
} from "@/lib/hooks/optimistic-diary";
import {
  applyOptimisticSummary,
  type DailySummary,
} from "@/lib/hooks/optimistic-summary";
import type { UpdateFoodEntryInput } from "@/lib/schemas/food";

export interface UpdateFoodEntryArgs {
  /** The resolved view of the row being edited (source of the optimistic patch). */
  entry: FoodEntryView;
  input: UpdateFoodEntryInput;
}

/** The view's four macros as EntryTotals (detail fields unknown client-side —
 *  the server rescales those from the row itself). */
function viewTotals(entry: FoodEntryView): EntryTotals {
  return {
    kcal: entry.kcal,
    proteinG: entry.proteinG,
    carbG: entry.carbG,
    fatG: entry.fatG,
    fiberG: null,
    sugarG: null,
    saltG: null,
    caffeineMg: null,
  };
}

/**
 * Edit a diary entry. Optimistically patches the cached row (quantity edits
 * rescale the view's own macros — the same math the server applies to the full
 * snapshot) and shifts the summary by the macro delta; rolls back on error and
 * invalidates the day's diary-dependent reads on settle.
 */
export function useUpdateFoodEntry(day: string) {
  const qc = useQueryClient();
  const foodKey = queryKeys.food(day);

  return useMutation({
    mutationFn: ({ entry, input }: UpdateFoodEntryArgs) =>
      patchJSON<FoodEntryDTO>(
        `/api/food/entries/${encodeURIComponent(entry.id)}`,
        input,
      ),
    onMutate: async ({ entry, input }): Promise<DiaryCtx> => {
      await qc.cancelQueries({ queryKey: foodKey });
      const prevEntries = qc.getQueryData<FoodEntryDTO[]>(foodKey);

      const next =
        input.quantityG !== undefined && entry.quantityG != null
          ? rescaleEntryTotals(viewTotals(entry), entry.quantityG, input.quantityG)
          : null;

      qc.setQueryData<FoodEntryDTO[]>(foodKey, (cur) =>
        (cur ?? []).map((e) => {
          if (e.id !== entry.id) return e;
          return {
            ...e,
            // DTO fields mirror the Decimal wire shape (strings).
            ...(input.quantityG !== undefined
              ? { quantityG: String(input.quantityG) }
              : {}),
            ...(next
              ? {
                  kcal: String(next.kcal),
                  proteinG: String(next.proteinG),
                  carbG: String(next.carbG),
                  fatG: String(next.fatG),
                }
              : {}),
            ...(input.meal !== undefined ? { meal: input.meal } : {}),
            ...(input.notes !== undefined ? { notes: input.notes } : {}),
          };
        }),
      );

      let prevSummary: DailySummary | null | undefined;
      if (next) {
        prevSummary = await applyOptimisticSummary(qc, day, (s) => ({
          ...s,
          intakeKcal: (s.intakeKcal ?? 0) + next.kcal - entry.kcal,
          proteinG: (s.proteinG ?? 0) + next.proteinG - entry.proteinG,
          carbG: (s.carbG ?? 0) + next.carbG - entry.carbG,
          fatG: (s.fatG ?? 0) + next.fatG - entry.fatG,
        }));
      }

      return { prevEntries, prevSummary };
    },
    onError: (_err, _args, ctx) => {
      rollbackDiary(qc, day, ctx);
      toast.error("Couldn't update entry");
    },
    onSuccess: () => {
      toast.success("Entry updated");
    },
    onSettled: () => {
      invalidateDiaryDay(qc, day);
      // A quantity edit changes the recents strip's last-used quantity.
      void qc.invalidateQueries({ queryKey: queryKeys.foodRecentPrefix() });
    },
  });
}
