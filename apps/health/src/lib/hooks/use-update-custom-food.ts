"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { putJSON } from "@/lib/fetcher";
import { queryKeys } from "@/lib/hooks/keys";
import type { UpdateCustomFoodInput } from "@/lib/schemas/food";

/**
 * Edit a saved custom food, then refresh the My Foods list. Past diary entries snapshot
 * their macros, so an edit never rewrites history.
 */
export function useUpdateCustomFood(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateCustomFoodInput) =>
      putJSON<{ id: string }>(`/api/food/custom/${id}`, input),
    onSuccess: () => toast.success("Food updated"),
    onError: () => toast.error("Couldn't update the food"),
    onSettled: () =>
      void qc.invalidateQueries({ queryKey: queryKeys.customFoods() }),
  });
}
