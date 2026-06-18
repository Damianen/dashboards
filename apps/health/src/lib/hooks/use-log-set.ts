"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { postJSON } from "@/lib/fetcher";
import { queryKeys } from "@/lib/hooks/keys";
import {
  applyOptimisticSummary,
  type DailySummary,
  rollbackSummary,
} from "@/lib/hooks/optimistic-summary";
import type { LogSetInput } from "@/lib/schemas/lifting";

type Ctx = { previous: DailySummary | null | undefined };

/**
 * Log a lifting set. Optimistically bumps the day's working volume / set count
 * (warmups add nothing — the domain guardrail), rolls back on error, and on
 * settle invalidates ["lifting"] (sessions + history) and the day's summary.
 * Pass `sessionId` from the session view so its ["session", id] detail refetches
 * too (the planned-vs-actual progress is read from there).
 */
export function useLogSet(day: string, sessionId?: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (input: LogSetInput) => postJSON("/api/lifting/sets", input),
    onMutate: async (input): Promise<Ctx> => {
      const addVolume = input.isWarmup ? 0 : input.reps * input.weightKg;
      const addSets = input.isWarmup ? 0 : 1;
      const previous = await applyOptimisticSummary(qc, day, (s) => ({
        ...s,
        liftingVolumeKg: (s.liftingVolumeKg ?? 0) + addVolume,
        workingSets: (s.workingSets ?? 0) + addSets,
      }));
      return { previous };
    },
    onError: (_err, _input, ctx) => {
      rollbackSummary(qc, day, ctx?.previous);
      toast.error("Couldn't log set");
    },
    onSuccess: () => {
      toast.success("Set logged");
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
