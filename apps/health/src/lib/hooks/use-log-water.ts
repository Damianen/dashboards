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
import { useDeleteWaterEntry } from "@/lib/hooks/use-delete-water-entry";
import { entryDayOf, type WaterEntryDTO } from "@/lib/hydration";
import type { LogWaterInput } from "@/lib/schemas/water";

type Ctx = { previous: DailySummary | null | undefined };

export function useLogWater(day: string) {
  const qc = useQueryClient();
  const deleteEntry = useDeleteWaterEntry();

  return useMutation({
    mutationFn: (input: LogWaterInput) =>
      postJSON<WaterEntryDTO>("/api/water", input),
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
    onSuccess: (entry, input) => {
      toast.success(`Logged ${input.amountMl} ml water`, {
        duration: 5000,
        // Sonner dismisses the toast when the action fires, so Undo can't
        // double-tap; the day comes from the server row, not the drawer.
        action: {
          label: "Undo",
          onClick: () =>
            deleteEntry.mutate({
              id: entry.id,
              day: entryDayOf(entry.day),
              amountMl: input.amountMl,
            }),
        },
      });
    },
    onSettled: () => invalidateDay(qc, day),
  });
}
