"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { postJSON } from "@/lib/fetcher";
import {
  applyOptimisticSummary,
  invalidateDay,
  rollbackSummary,
  type DailySummary,
} from "@/lib/hooks/optimistic-summary";
import type { LogWaterInput } from "@/lib/schemas/water";

type Ctx = { previous: DailySummary | null | undefined };

export function useLogWater(day: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (input: LogWaterInput) => postJSON("/api/water", input),
    onMutate: async (input): Promise<Ctx> => {
      const previous = await applyOptimisticSummary(qc, day, (s) => ({
        ...s,
        waterMl: (s.waterMl ?? 0) + input.amountMl,
      }));
      return { previous };
    },
    onError: (_err, _input, ctx) => {
      rollbackSummary(qc, day, ctx?.previous);
      toast.error("Couldn't log water");
    },
    onSuccess: (_data, input) => {
      toast.success(`Logged ${input.amountMl} ml water`);
    },
    onSettled: () => invalidateDay(qc, day),
  });
}
