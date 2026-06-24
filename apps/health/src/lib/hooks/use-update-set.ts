"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { patchJSON } from "@/lib/fetcher";
import { queryKeys } from "@/lib/hooks/keys";
import type { UpdateSetInput } from "@/lib/schemas/lifting";

interface UpdateVars {
  id: string;
  input: UpdateSetInput;
}

/**
 * Edit an already-logged set in place. The session detail owns the canonical
 * planned-vs-actual progress and the "Previous" column, and editing reps/weight
 * changes the day's volume — so on settle we invalidate the session, the day
 * summary, and the shared ["lifting"] reads. No optimistic patch: computing the
 * volume delta needs the old values, and the session refetch is cheap.
 */
export function useUpdateSet(day: string, sessionId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: UpdateVars) =>
      patchJSON(`/api/lifting/sets/${id}`, input),
    onError: () => toast.error("Couldn't update set"),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.lifting() });
      void qc.invalidateQueries({ queryKey: queryKeys.summary(day) });
      if (sessionId) {
        void qc.invalidateQueries({ queryKey: queryKeys.session(sessionId) });
      }
    },
  });
}
