"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { Exercise } from "@/generated/prisma/client";
import { getJSON } from "@/lib/fetcher";
import { queryKeys } from "@/lib/hooks/keys";
import type { CreateExerciseInput } from "@/lib/schemas/exercise";

export type { Exercise };

/** The full exercise catalogue (ordered by name). Near-static, so cache it longer. */
export function useExercises() {
  return useQuery({
    queryKey: queryKeys.exercises(),
    queryFn: () => getJSON<Exercise[]>("/api/exercises"),
    staleTime: 5 * 60_000,
  });
}

/** POST a new exercise, surfacing the service's 400 `{ error }` message (e.g. a
 *  duplicate name) as the thrown Error — the shared postJSON discards the body. */
async function postExercise(input: CreateExerciseInput): Promise<Exercise> {
  const res = await fetch("/api/exercises", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error ?? "Couldn't create exercise");
  }
  return res.json() as Promise<Exercise>;
}

/** Create a catalog exercise, then slot it into the cached list (kept name-sorted)
 *  so the picker shows it immediately. */
export function useCreateExercise() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: postExercise,
    onSuccess: (created) => {
      qc.setQueryData<Exercise[]>(queryKeys.exercises(), (prev) =>
        prev
          ? [...prev, created].sort((a, b) => a.name.localeCompare(b.name))
          : [created],
      );
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.exercises() });
    },
  });
}
