"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { postJSON } from "@/lib/fetcher";
import { queryKeys } from "@/lib/hooks/keys";
import type { CreateCustomFoodInput } from "@/lib/schemas/food";

/**
 * Create a saved custom food, then refresh the My Foods list. Returns the created row
 * (with id) so the caller can hand it straight to the quantity step ("Save & log").
 * Success messaging is left to the caller (save vs. save-and-log differ).
 */
export function useCreateCustomFood() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCustomFoodInput) =>
      postJSON<{ id: string }>("/api/food/custom", input),
    onError: () => toast.error("Couldn't save the food"),
    onSettled: () =>
      void qc.invalidateQueries({ queryKey: queryKeys.customFoods() }),
  });
}
