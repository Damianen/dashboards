"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { HttpError, putJSON } from "@/lib/fetcher";
import { queryKeys } from "@/lib/hooks/keys";
import type { UpdateDailyPlanInput } from "@/lib/schemas/daily-plans";
import type { DailyPlanDetail } from "@/server/services/dailyPlans";

/** Update a plan (full replace), then refresh the list and this plan's detail. */
export function useUpdateDailyPlan(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateDailyPlanInput) =>
      putJSON<DailyPlanDetail>(`/api/food/daily-plans/${id}`, input),
    onSuccess: () => toast.success("Plan updated"),
    onError: (err) =>
      toast.error(
        err instanceof HttpError && err.status === 400
          ? "That name is already taken"
          : "Couldn't update plan",
      ),
    onSettled: () =>
      void qc.invalidateQueries({ queryKey: queryKeys.dailyPlans() }),
  });
}
