"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { delJSON, HttpError, httpErrorMessage } from "@/lib/fetcher";
import {
  applyOptimisticSummary,
  invalidateDay,
  rollbackSummary,
  type DailySummary,
} from "@/lib/hooks/optimistic-summary";

export interface DeleteWaterEntryVars {
  id: string;
  /** The SERVER row's civil day (entryDayOf) — not the drawer's todayLocal(), so
   *  undoing an entry logged just before midnight still fixes the right day. */
  day: string;
  amountMl: number;
}

type Ctx = { previous: DailySummary | null | undefined };

/** Remove one water entry (the log toast's Undo action). */
export function useDeleteWaterEntry() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ id }: DeleteWaterEntryVars) =>
      delJSON<{ id: string; day: string }>(
        `/api/water/${encodeURIComponent(id)}`,
      ),
    onMutate: async ({ day, amountMl }): Promise<Ctx> => {
      const previous = await applyOptimisticSummary(qc, day, (s) => ({
        ...s,
        waterMl: Math.max(0, (s.waterMl ?? 0) - amountMl),
      }));
      return { previous };
    },
    onError: (err, { day }, ctx) => {
      rollbackSummary(qc, day, ctx?.previous);
      // A raced double-undo 404s — the row is already gone, which is what the
      // user wanted; the settle refetch trues things up without an error toast.
      if (!(err instanceof HttpError && err.status === 404)) {
        toast.error(httpErrorMessage(err, "Couldn't undo"));
      }
    },
    onSuccess: (_data, { amountMl }) => {
      toast.success(`Removed ${amountMl} ml water`);
    },
    onSettled: (_data, _err, { day }) => void invalidateDay(qc, day),
  });
}
