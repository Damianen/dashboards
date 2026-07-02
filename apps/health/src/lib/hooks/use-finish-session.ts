"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { postJSON } from "@/lib/fetcher";
import { queryKeys } from "@/lib/hooks/keys";

/**
 * Finish/reopen pair for the active workout. `finish` stamps endedAt and
 * returns to the Start Workout list, with a toast Undo that calls `unfinish` —
 * which clears the stamp and navigates back into the live session. Two
 * mutations (not one toggle) so the Undo action can reference its inverse.
 */
export function useFinishSession(sessionId: string, day: string) {
  const qc = useQueryClient();
  const router = useRouter();

  function invalidate() {
    void qc.invalidateQueries({ queryKey: queryKeys.lifting() });
    void qc.invalidateQueries({ queryKey: queryKeys.summary(day) });
    void qc.invalidateQueries({ queryKey: queryKeys.session(sessionId) });
  }

  const unfinish = useMutation({
    mutationFn: () =>
      postJSON(`/api/lifting/sessions/${sessionId}/finish`, {
        finished: false,
      }),
    onSuccess: () => {
      toast.success("Workout reopened");
      invalidate();
      // No-op when already on the session; brings you back when undoing
      // from the /lifting list.
      router.push(`/lifting/sessions/${sessionId}`);
    },
    onError: () => toast.error("Couldn't reopen workout"),
  });

  const finish = useMutation({
    mutationFn: () => postJSON(`/api/lifting/sessions/${sessionId}/finish`, {}),
    onSuccess: () => {
      toast.success("Workout finished", {
        duration: 5000,
        action: { label: "Undo", onClick: () => unfinish.mutate() },
      });
      invalidate();
      router.push("/lifting");
    },
    onError: () => toast.error("Couldn't finish workout"),
  });

  return { finish, unfinish };
}
