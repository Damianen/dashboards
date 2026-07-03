"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { httpErrorMessage, postJSON } from "@/lib/fetcher";
import { queryKeys } from "@/lib/hooks/keys";
import {
  applyOptimisticSummary,
  invalidateDay,
  rollbackSummary,
  type DailySummary,
} from "@/lib/hooks/optimistic-summary";
import { useDeleteStimulantEntry } from "@/lib/hooks/use-delete-stimulant-entry";
import { entryDayOf, type LogStimulantResponseDTO } from "@/lib/hydration";
import type { LogStimulantInput } from "@/lib/schemas/stimulant";

type Ctx = { previous: DailySummary | null | undefined };

export function useLogStimulant(day: string) {
  const qc = useQueryClient();
  const deleteEntry = useDeleteStimulantEntry();

  return useMutation({
    // The stimulants endpoint returns the created entry + the day's NEW water
    // target (mL).
    mutationFn: (input: LogStimulantInput) =>
      postJSON<LogStimulantResponseDTO>("/api/stimulants", input),
    onMutate: async (input): Promise<Ctx> => {
      const previous = await applyOptimisticSummary(qc, day, (s) => ({
        ...s,
        stimulantMg: (s.stimulantMg ?? 0) + input.amountMg,
        // Stimulants are one source of the unified caffeine total too.
        caffeineMg: (s.caffeineMg ?? 0) + input.amountMg,
      }));
      return { previous };
    },
    onError: (err, _input, ctx) => {
      rollbackSummary(qc, day, ctx?.previous);
      toast.error(httpErrorMessage(err, "Couldn't log stimulant"));
    },
    onSuccess: ({ entry, waterTargetMl }, input) => {
      // waterTargetMl is server-computed (the formula lives only on the server),
      // so it's safe to drop straight into the cache for instant feedback.
      qc.setQueryData<DailySummary | null>(queryKeys.summary(day), (s) =>
        s ? { ...s, waterTargetMl } : s,
      );
      toast.success(
        `Logged ${input.amountMg} mg ${input.substance ?? "caffeine"}`,
        {
          description: `Water target now ${Math.round(waterTargetMl)} ml`,
          duration: 5000,
          // Sonner dismisses the toast when the action fires, so Undo can't
          // double-tap; the day comes from the server row, not the drawer.
          action: {
            label: "Undo",
            onClick: () =>
              deleteEntry.mutate({
                id: entry.id,
                day: entryDayOf(entry.day),
                amountMg: input.amountMg,
              }),
          },
        },
      );
    },
    onSettled: () => invalidateDay(qc, day),
  });
}
