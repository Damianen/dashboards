"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { postJSON } from "@/lib/fetcher";
import { queryKeys } from "@/lib/hooks/keys";

/** Archive a meal (hidden from the list; never deleted), then refresh the list. */
export function useArchiveMeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => postJSON(`/api/food/meals/${id}/archive`, {}),
    onSuccess: () => toast.success("Meal archived"),
    onError: () => toast.error("Couldn't archive meal"),
    onSettled: () => void qc.invalidateQueries({ queryKey: queryKeys.meals() }),
  });
}
