"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { httpErrorMessage, postJSON } from "@/lib/fetcher";
import { formatHm } from "@/lib/format";
import { invalidateAfterSync } from "@/lib/hooks/keys";
import {
  applyOptimisticSummary,
  rollbackSummary,
  type DailySummary,
} from "@/lib/hooks/optimistic-summary";
import type { LogSleepInput } from "@/lib/schemas/sleep";
import { resolveSleepWindow } from "@/lib/sleep-entry";

type Ctx = { previous: DailySummary | null | undefined };

/** The created SleepSession fields the toast needs (dates arrive as strings). */
type LoggedSleep = { id: string; totalSleepMin: number };

/**
 * Log a manual sleep entry (the Oura-outage fallback). The optimistic patch
 * ADDS the logged minutes to the day's totalSleepMin — the view sums a day's
 * sessions, so a nap on top of an earlier manual entry accumulates. Minutes
 * come from the same pure resolver the service uses; a resolver refusal skips
 * the patch and lets the server reply with the real error. A landed sleep
 * entry is cache-indistinguishable from one a sync landed (summary, trends,
 * recovery, briefing, weekly review), so settle reuses invalidateAfterSync —
 * the use-log-weight idiom.
 */
export function useLogSleep(day: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (input: LogSleepInput) =>
      postJSON<LoggedSleep>("/api/sleep", input),
    onMutate: async (input): Promise<Ctx> => {
      let minutes: number | null = null;
      try {
        minutes = resolveSleepWindow(input, new Date()).totalSleepMin;
      } catch {
        // Invalid window — the POST will be refused; nothing to patch.
      }
      const previous =
        minutes == null
          ? undefined
          : await applyOptimisticSummary(qc, day, (s) => ({
              ...s,
              totalSleepMin: (s.totalSleepMin ?? 0) + minutes,
            }));
      return { previous };
    },
    onError: (err, _input, ctx) => {
      rollbackSummary(qc, day, ctx?.previous);
      toast.error(httpErrorMessage(err, "Couldn't log sleep"));
    },
    onSuccess: (data) => {
      toast.success(`Logged ${formatHm(data.totalSleepMin)} of sleep`);
    },
    onSettled: () => invalidateAfterSync(qc),
  });
}
