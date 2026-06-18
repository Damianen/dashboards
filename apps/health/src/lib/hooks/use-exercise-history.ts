"use client";

import { useQuery } from "@tanstack/react-query";

import { getJSON } from "@/lib/fetcher";
import { queryKeys } from "@/lib/hooks/keys";

/** A history set as it arrives over HTTP: Prisma.Decimal serialises to a string. */
export interface HistorySet {
  reps: number;
  weightKg: string;
  rpe: string | null;
  isWarmup: boolean;
}

export interface HistorySession {
  sessionId: string;
  day: string;
  startedAt: string;
  sets: HistorySet[];
  volumeKg: number;
}

/**
 * Recent sessions containing `exercise`, newest first. A never-logged exercise
 * 404s — that surfaces as `isError`, meaning "no history", not a fault to retry.
 * Disabled until an exercise is chosen.
 */
export function useExerciseHistory(exercise: string | null, limit = 1) {
  return useQuery({
    queryKey: queryKeys.liftingHistory(exercise ?? "", limit),
    enabled: exercise != null && exercise !== "",
    retry: false,
    queryFn: () =>
      getJSON<HistorySession[]>(
        `/api/lifting/history?exercise=${encodeURIComponent(
          exercise ?? "",
        )}&limit=${limit}`,
      ),
  });
}
