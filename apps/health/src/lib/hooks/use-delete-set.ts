"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { del, httpErrorMessage } from "@/lib/fetcher";
import { queryKeys } from "@/lib/hooks/keys";
import {
  applyOptimisticSummary,
  type DailySummary,
  rollbackSummary,
} from "@/lib/hooks/optimistic-summary";

interface DeleteSetVars {
  id: string;
  reps: number;
  weightKg: number;
  isWarmup: boolean;
}

type Ctx = { previous: DailySummary | null | undefined };

/**
 * Delete a logged set (the logger's ✓ untoggle) — the inverse of useLogSet.
 * Optimistically drops the day's working volume / set count (warmups subtract
 * nothing, mirroring what logging added; both clamped at 0), rolls back on
 * error, and on settle invalidates the session detail (the row vanishes and
 * its slot returns to an editable placeholder), the day summary (volume
 * drops), and the shared ["lifting"] reads.
 */
export function useDeleteSet(day: string, sessionId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: DeleteSetVars) => del(`/api/lifting/sets/${id}`),
    onMutate: async (vars): Promise<Ctx> => {
      const subVolume = vars.isWarmup ? 0 : vars.reps * vars.weightKg;
      const subSets = vars.isWarmup ? 0 : 1;
      const previous = await applyOptimisticSummary(qc, day, (s) => ({
        ...s,
        liftingVolumeKg: Math.max(0, (s.liftingVolumeKg ?? 0) - subVolume),
        workingSets: Math.max(0, (s.workingSets ?? 0) - subSets),
      }));
      return { previous };
    },
    onError: (err, _vars, ctx) => {
      rollbackSummary(qc, day, ctx?.previous);
      toast.error(httpErrorMessage(err, "Couldn't delete set"));
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.lifting() });
      void qc.invalidateQueries({ queryKey: queryKeys.summary(day) });
      if (sessionId) {
        void qc.invalidateQueries({ queryKey: queryKeys.session(sessionId) });
      }
    },
  });
}
