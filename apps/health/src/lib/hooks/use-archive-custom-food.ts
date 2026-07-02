"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { postJSON } from "@/lib/fetcher";
import { queryKeys } from "@/lib/hooks/keys";

/**
 * Archive (retire) a saved custom food, or restore it ({ archived: false }), then refresh
 * the My Foods list. Archiving hides it from the active list and from MCP name resolution;
 * past diary entries are untouched.
 */
export function useArchiveCustomFood() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, archived = true }: { id: string; archived?: boolean }) =>
      postJSON(`/api/food/custom/${id}/archive`, { archived }),
    onSuccess: (_data, { archived = true }) =>
      toast.success(archived ? "Food archived" : "Food restored"),
    onError: () => toast.error("Couldn't update the food"),
    onSettled: () =>
      void qc.invalidateQueries({ queryKey: queryKeys.customFoods() }),
  });
}
