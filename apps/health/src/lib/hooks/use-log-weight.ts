"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { httpErrorMessage, postJSON } from "@/lib/fetcher";
import { invalidateAfterSync } from "@/lib/hooks/keys";
import {
  applyOptimisticSummary,
  rollbackSummary,
  type DailySummary,
} from "@/lib/hooks/optimistic-summary";
import type { LogWeightInput } from "@/lib/schemas/weight";

type Ctx = { previous: DailySummary | null | undefined };

/**
 * Log a manual weigh-in. A weight change is cache-indistinguishable from one a
 * sync landed, so settle reuses invalidateAfterSync — summary, trends, protein
 * target (adherence), goal ETA and TDEE all refetch.
 */
export function useLogWeight(day: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (input: LogWeightInput) => postJSON("/api/weight", input),
    onMutate: async (input): Promise<Ctx> => {
      const previous = await applyOptimisticSummary(qc, day, (s) => ({
        ...s,
        weightKg: input.weightKg,
      }));
      return { previous };
    },
    onError: (err, _input, ctx) => {
      rollbackSummary(qc, day, ctx?.previous);
      toast.error(httpErrorMessage(err, "Couldn't log weight"));
    },
    onSuccess: (_data, input) => {
      toast.success(`Logged ${input.weightKg} kg`);
    },
    onSettled: () => invalidateAfterSync(qc),
  });
}
