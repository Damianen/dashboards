"use client";

import { useMemo } from "react";

import { useLiftingSessions } from "@/lib/hooks/use-lifting-sessions";

/**
 * Exercise ids ordered by how recently they were last logged (newest first).
 * Assumes `sessions` is already newest-first (the API's order). Structural
 * parameter type keeps the function pure and testable without DTO imports.
 */
export function recentExerciseIds(
  sessions:
    | readonly { exercises: readonly { exerciseId: string }[] }[]
    | undefined,
): string[] {
  const ids: string[] = [];
  for (const session of sessions ?? []) {
    for (const group of session.exercises) {
      if (!ids.includes(group.exerciseId)) ids.push(group.exerciseId);
    }
  }
  return ids;
}

/** Recently-logged exercise ids from the cached sessions list, newest first. */
export function useRecentExerciseIds(): string[] {
  const { data: sessions } = useLiftingSessions();
  return useMemo(() => recentExerciseIds(sessions), [sessions]);
}
