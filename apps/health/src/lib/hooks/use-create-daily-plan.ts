"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { HttpError, postJSON } from "@/lib/fetcher";
import { queryKeys } from "@/lib/hooks/keys";
import type { CreateDailyPlanInput } from "@/lib/schemas/daily-plans";
import type { DailyPlanDetail } from "@/server/services/dailyPlans";

/** Create a daily plan, then refresh the plans list. A 400 is almost always a
 *  duplicate name (the only client-reachable domain refusal on this path). */
export function useCreateDailyPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateDailyPlanInput) =>
      postJSON<DailyPlanDetail>("/api/food/daily-plans", input),
    onSuccess: () => toast.success("Plan saved"),
    onError: (err) =>
      toast.error(
        err instanceof HttpError && err.status === 400
          ? "That name is already taken"
          : "Couldn't save plan",
      ),
    onSettled: () =>
      void qc.invalidateQueries({ queryKey: queryKeys.dailyPlans() }),
  });
}
