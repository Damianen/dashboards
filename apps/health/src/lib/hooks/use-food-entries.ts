"use client";

import { useQuery } from "@tanstack/react-query";

import { getJSON } from "@/lib/fetcher";
import type { FoodEntryDTO } from "@/lib/food";
import { queryKeys } from "@/lib/hooks/keys";

/** A day's food entries (eatenAt-desc), each with its product join for display. */
export function useFoodEntries(day: string) {
  return useQuery({
    queryKey: queryKeys.food(day),
    queryFn: () =>
      getJSON<FoodEntryDTO[]>(
        `/api/food/entries?day=${encodeURIComponent(day)}`,
      ),
  });
}
