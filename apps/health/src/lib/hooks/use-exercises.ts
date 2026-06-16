"use client";

import { useQuery } from "@tanstack/react-query";

import type { Exercise } from "@/generated/prisma/client";
import { getJSON } from "@/lib/fetcher";
import { queryKeys } from "@/lib/hooks/keys";

export type { Exercise };

/** The full exercise catalogue (ordered by name). Near-static, so cache it longer. */
export function useExercises() {
  return useQuery({
    queryKey: queryKeys.exercises(),
    queryFn: () => getJSON<Exercise[]>("/api/exercises"),
    staleTime: 5 * 60_000,
  });
}
