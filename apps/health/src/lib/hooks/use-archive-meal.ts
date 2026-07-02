"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { postJSON } from "@/lib/fetcher";
import { queryKeys } from "@/lib/hooks/keys";

/**
 * Archive a meal (hidden from the list; never deleted) or restore it
 * ({ archived: false }), then refresh the list (the ["meals"] prefix covers
 * both filters and any open builder detail).
 */
export function useArchiveMeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, archived = true }: { id: string; archived?: boolean }) =>
      postJSON(`/api/food/meals/${id}/archive`, { archived }),
    onSuccess: (_data, { archived = true }) =>
      toast.success(archived ? "Meal archived" : "Meal restored"),
    onError: () => toast.error("Couldn't update the meal"),
    onSettled: () => void qc.invalidateQueries({ queryKey: queryKeys.meals() }),
  });
}
