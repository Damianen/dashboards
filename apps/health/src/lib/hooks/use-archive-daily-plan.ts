"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { postJSON } from "@/lib/fetcher";
import { queryKeys } from "@/lib/hooks/keys";

/**
 * Archive a plan (hidden from the list; never deleted) or restore it
 * ({ archived: false }), then refresh the list (the ["daily-plans"] prefix
 * covers both filters and any open builder detail).
 */
export function useArchiveDailyPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, archived = true }: { id: string; archived?: boolean }) =>
      postJSON(`/api/food/daily-plans/${id}/archive`, { archived }),
    onSuccess: (_data, { archived = true }) =>
      toast.success(archived ? "Plan archived" : "Plan restored"),
    onError: () => toast.error("Couldn't update the plan"),
    onSettled: () =>
      void qc.invalidateQueries({ queryKey: queryKeys.dailyPlans() }),
  });
}
