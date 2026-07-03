"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { Exercise } from "@/generated/prisma/client";
import { getJSON, HttpError, httpErrorMessage, postJSON } from "@/lib/fetcher";
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
 *  duplicate name) as a plain thrown Error — the picker renders err.message
 *  verbatim, so a raw HttpError must never escape here. */
async function postExercise(input: CreateExerciseInput): Promise<Exercise> {
  try {
    return await postJSON<Exercise>("/api/exercises", input);
  } catch (err) {
    if (err instanceof HttpError) {
      throw new Error(httpErrorMessage(err, "Couldn't create exercise"));
    }
    throw err; // network TypeError etc. — same propagation as before
  }
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
