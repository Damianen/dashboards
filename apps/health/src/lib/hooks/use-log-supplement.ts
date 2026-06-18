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
import type { LogSupplementInput } from "@/lib/schemas/supplement";

type Ctx = { previous: DailySummary | null | undefined };

export function useLogSupplement(day: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (input: LogSupplementInput) =>
      postJSON("/api/supplements", input),
    onMutate: async (): Promise<Ctx> => {
      const previous = await applyOptimisticSummary(qc, day, (s) => ({
        ...s,
        supplementsTaken: (s.supplementsTaken ?? 0) + 1,
      }));
      return { previous };
    },
    onError: (_err, _input, ctx) => {
      rollbackSummary(qc, day, ctx?.previous);
      toast.error("Couldn't log supplement");
    },
    onSuccess: (_data, input) => {
      // A freshly used name should appear in the datalist next time.
      void qc.invalidateQueries({ queryKey: queryKeys.supplementNames() });
      toast.success(`Logged ${input.name}`);
    },
    onSettled: () => invalidateDay(qc, day),
  });
}
