"use client";

import {
  useMutation,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";

import { httpErrorMessage, postJSON } from "@/lib/fetcher";
import { queryKeys } from "@/lib/hooks/keys";
import type { CreateGoalInput } from "@/lib/schemas/goals";
import type { CheckInDTO, GoalDTO, GoalPlan } from "@/server/services/goals";

/** Everything a goal mutation can move: the goal reads themselves, the targets
 *  adherence serves (intake card / protein card), and the briefing sections. */
function invalidateGoalReads(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: queryKeys.goal() });
  void qc.invalidateQueries({ queryKey: queryKeys.adherencePrefix() });
  void qc.invalidateQueries({ queryKey: queryKeys.briefingPrefix() });
}

/** Create the active goal. The success toast carries the derived target. */
export function useCreateGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateGoalInput) =>
      postJSON<{ goal: GoalDTO; plan: GoalPlan }>("/api/goals", input),
    onSuccess: ({ plan }) => {
      invalidateGoalReads(qc);
      toast.success(
        `Goal created — target ${plan.targetKcal.toLocaleString("en-US")} kcal/day`,
      );
    },
    onError: (err) =>
      toast.error(httpErrorMessage(err, "Couldn't create the goal")),
  });
}

/** One-tap Accept/Dismiss on a PROPOSED weekly check-in. */
export function useDecideCheckIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      decision,
    }: {
      id: string;
      decision: "accept" | "dismiss";
    }) => postJSON<CheckInDTO>(`/api/goals/checkins/${id}/decide`, { decision }),
    onSuccess: (checkIn) => {
      invalidateGoalReads(qc);
      toast.success(
        checkIn.status === "ACCEPTED"
          ? `Target updated to ${checkIn.proposedTargetKcal.toLocaleString("en-US")} kcal/day`
          : "Proposal dismissed — target unchanged",
      );
    },
    onError: (err) =>
      toast.error(httpErrorMessage(err, "Couldn't decide the check-in")),
  });
}

/** Explicit complete/abandon — the only status transitions (never automatic). */
export function useEndGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      action,
    }: {
      id: string;
      action: "complete" | "abandon";
    }) => postJSON<GoalDTO>(`/api/goals/${id}/${action}`, {}),
    onSuccess: (goal) => {
      invalidateGoalReads(qc);
      toast.success(
        goal.status === "COMPLETED" ? "Goal completed 🎉" : "Goal abandoned",
      );
    },
    onError: (err) =>
      toast.error(httpErrorMessage(err, "Couldn't update the goal")),
  });
}
