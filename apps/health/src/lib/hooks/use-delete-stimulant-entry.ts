"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { delJSON, HttpError, httpErrorMessage } from "@/lib/fetcher";
import { queryKeys } from "@/lib/hooks/keys";
import {
  applyOptimisticSummary,
  invalidateDay,
  rollbackSummary,
  type DailySummary,
} from "@/lib/hooks/optimistic-summary";

export interface DeleteStimulantEntryVars {
  id: string;
  /** The SERVER row's civil day (entryDayOf) — not the drawer's todayLocal(), so
   *  undoing an entry logged just before midnight still fixes the right day. */
  day: string;
  amountMg: number;
}

type Ctx = { previous: DailySummary | null | undefined };

/** Remove one stimulant entry (the log toast's Undo action). The server replies
 *  with the day's recomputed water target, which drops straight into the cache —
 *  the mirror of what logging wrote. */
export function useDeleteStimulantEntry() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ id }: DeleteStimulantEntryVars) =>
      delJSON<{ id: string; day: string; waterTargetMl: number }>(
        `/api/stimulants/${encodeURIComponent(id)}`,
      ),
    onMutate: async ({ day, amountMg }): Promise<Ctx> => {
      const previous = await applyOptimisticSummary(qc, day, (s) => ({
        ...s,
        stimulantMg: Math.max(0, (s.stimulantMg ?? 0) - amountMg),
        caffeineMg: Math.max(0, (s.caffeineMg ?? 0) - amountMg),
      }));
      return { previous };
    },
    onError: (err, { day }, ctx) => {
      rollbackSummary(qc, day, ctx?.previous);
      if (!(err instanceof HttpError && err.status === 404)) {
        toast.error(httpErrorMessage(err, "Couldn't undo"));
      }
    },
    onSuccess: ({ waterTargetMl }, { day, amountMg }) => {
      qc.setQueryData<DailySummary | null>(queryKeys.summary(day), (s) =>
        s ? { ...s, waterTargetMl } : s,
      );
      toast.success(`Removed ${amountMg} mg`, {
        description: `Water target back to ${Math.round(waterTargetMl)} ml`,
      });
    },
    onSettled: (_data, _err, { day }) => void invalidateDay(qc, day),
  });
}
