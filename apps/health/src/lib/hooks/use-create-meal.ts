"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { postJSON } from "@/lib/fetcher";
import { queryKeys } from "@/lib/hooks/keys";
import type { CreateMealInput } from "@/lib/schemas/meals";
import type { MealDetail } from "@/server/services/meals";

/** Create a saved meal, then refresh the meals list. */
export function useCreateMeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateMealInput) =>
      postJSON<MealDetail>("/api/food/meals", input),
    onSuccess: () => toast.success("Meal saved"),
    onError: () => toast.error("Couldn't save meal"),
    onSettled: () => void qc.invalidateQueries({ queryKey: queryKeys.meals() }),
  });
}
