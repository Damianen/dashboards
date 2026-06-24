"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { postJSON } from "@/lib/fetcher";
import { queryKeys } from "@/lib/hooks/keys";

/**
 * Finish the active workout (stamps endedAt server-side) and return to the
 * Start Workout list. Invalidates the session detail, the day summary, and the
 * shared ["lifting"] reads so the finished session shows up in history.
 */
export function useFinishSession(sessionId: string, day: string) {
  const qc = useQueryClient();
  const router = useRouter();
  return useMutation({
    mutationFn: () =>
      postJSON(`/api/lifting/sessions/${sessionId}/finish`, {}),
    onSuccess: () => {
      toast.success("Workout finished");
      void qc.invalidateQueries({ queryKey: queryKeys.lifting() });
      void qc.invalidateQueries({ queryKey: queryKeys.summary(day) });
      void qc.invalidateQueries({ queryKey: queryKeys.session(sessionId) });
      router.push("/lifting");
    },
    onError: () => toast.error("Couldn't finish workout"),
  });
}
