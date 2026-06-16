"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { postJSON } from "@/lib/fetcher";
import { queryKeys } from "@/lib/hooks/keys";
import {
  applyOptimisticSummary,
  invalidateDay,
  rollbackSummary,
  type DailySummary,
} from "@/lib/hooks/optimistic-summary";
import type { LogStimulantInput } from "@/lib/schemas/stimulant";

type Ctx = { previous: DailySummary | null | undefined };

export function useLogStimulant(day: string) {
  const qc = useQueryClient();

  return useMutation({
    // The stimulants endpoint returns the day's NEW water target (mL).
    mutationFn: (input: LogStimulantInput) =>
      postJSON<number>("/api/stimulants", input),
    onMutate: async (input): Promise<Ctx> => {
      const previous = await applyOptimisticSummary(qc, day, (s) => ({
        ...s,
        stimulantMg: (s.stimulantMg ?? 0) + input.amountMg,
      }));
      return { previous };
    },
    onError: (_err, _input, ctx) => {
      rollbackSummary(qc, day, ctx?.previous);
      toast.error("Couldn't log stimulant");
    },
    onSuccess: (newTargetMl, input) => {
      // newTargetMl is server-computed (the formula lives only on the server),
      // so it's safe to drop straight into the cache for instant feedback.
      qc.setQueryData<DailySummary | null>(queryKeys.summary(day), (s) =>
        s ? { ...s, waterTargetMl: newTargetMl } : s,
      );
      toast.success(
        `Logged ${input.amountMg} mg ${input.substance ?? "caffeine"}`,
        { description: `Water target now ${Math.round(newTargetMl)} ml` },
      );
    },
    onSettled: () => invalidateDay(qc, day),
  });
}
