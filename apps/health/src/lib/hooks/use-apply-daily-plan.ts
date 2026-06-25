"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { postJSON } from "@/lib/fetcher";
import { queryKeys } from "@/lib/hooks/keys";
import type { ApplyDailyPlanResult } from "@/server/services/dailyPlans";

export interface ApplyDailyPlanArgs {
  id: string;
  day: string;
}

const items = (n: number) => `${n} item${n === 1 ? "" : "s"}`;

/**
 * Apply a plan onto a day's diary. Unlike the single-log mutations this is a
 * server-side BATCH that resolves each item's macros, so it refetches on success
 * rather than prepending optimistically: on done it invalidates ["food", day] and
 * ["summary", day] so the new rows and totals appear. Reports how many logged and
 * how many were skipped.
 */
export function useApplyDailyPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, day }: ApplyDailyPlanArgs) =>
      postJSON<ApplyDailyPlanResult>(`/api/food/daily-plans/${id}/apply`, {
        day,
      }),
    onSuccess: (res, { day }) => {
      if (res.logged === 0) {
        toast.error("Nothing logged", {
          description:
            res.skipped.length > 0
              ? `${items(res.skipped.length)} skipped`
              : "this plan has no items",
        });
      } else {
        toast.success(`Logged ${items(res.logged)}`, {
          description:
            res.skipped.length > 0
              ? `${items(res.skipped.length)} skipped`
              : undefined,
        });
      }
      void qc.invalidateQueries({ queryKey: queryKeys.food(day) });
      void qc.invalidateQueries({ queryKey: queryKeys.summary(day) });
    },
    onError: () => toast.error("Couldn't apply plan"),
  });
}
