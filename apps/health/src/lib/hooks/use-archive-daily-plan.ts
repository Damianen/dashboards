"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { postJSON } from "@/lib/fetcher";
import { queryKeys } from "@/lib/hooks/keys";

/** Archive a plan (hidden from the list; never deleted), then refresh the list. */
export function useArchiveDailyPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      postJSON(`/api/food/daily-plans/${id}/archive`, {}),
    onSuccess: () => toast.success("Plan archived"),
    onError: () => toast.error("Couldn't archive plan"),
    onSettled: () =>
      void qc.invalidateQueries({ queryKey: queryKeys.dailyPlans() }),
  });
}
