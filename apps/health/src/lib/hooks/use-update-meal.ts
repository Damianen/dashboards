"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { putJSON } from "@/lib/fetcher";
import { queryKeys } from "@/lib/hooks/keys";
import type { UpdateMealInput } from "@/lib/schemas/meals";
import type { MealDetail } from "@/server/services/meals";

/** Update a saved meal (full replace), then refresh the list and this meal's detail. */
export function useUpdateMeal(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateMealInput) =>
      putJSON<MealDetail>(`/api/food/meals/${id}`, input),
    onSuccess: () => toast.success("Meal updated"),
    onError: () => toast.error("Couldn't update meal"),
    onSettled: () => void qc.invalidateQueries({ queryKey: queryKeys.meals() }),
  });
}
