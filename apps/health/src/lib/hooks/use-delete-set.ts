"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { del } from "@/lib/fetcher";
import { queryKeys } from "@/lib/hooks/keys";

/**
 * Delete a logged set (the logger's ✓ untoggle). Invalidates the session detail
 * (the row vanishes and its slot returns to an editable placeholder), the day
 * summary (volume drops), and the shared ["lifting"] reads.
 */
export function useDeleteSet(day: string, sessionId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => del(`/api/lifting/sets/${id}`),
    onError: () => toast.error("Couldn't delete set"),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.lifting() });
      void qc.invalidateQueries({ queryKey: queryKeys.summary(day) });
      if (sessionId) {
        void qc.invalidateQueries({ queryKey: queryKeys.session(sessionId) });
      }
    },
  });
}
