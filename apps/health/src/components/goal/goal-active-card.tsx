"use client";

import { useState } from "react";

import { GOAL_PHASE_LABELS, signedRate } from "@/components/goal/phase";
import { Progress } from "@/components/today/metric-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ConfirmSheet } from "@/components/ui/confirm-sheet";
import { dateLabel, formatKg, formatNumber } from "@/lib/format";
import type { ActiveGoalView } from "@/lib/hooks/use-goal";
import { useEndGoal } from "@/lib/hooks/use-goal-mutations";

/**
 * The active goal: the stored daily target (always shown — it stays frozen when
 * TDEE confidence drops), trend-vs-goal progress, the planned rate, and the
 * completion banner. Completing/abandoning is always an explicit user action.
 */
export function GoalActiveCard({ goal }: { goal: ActiveGoalView }) {
  const end = useEndGoal();
  const [abandonOpen, setAbandonOpen] = useState(false);

  const completionDue =
    goal.completion.trendReached || goal.completion.datePassed;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Badge variant="secondary">{GOAL_PHASE_LABELS[goal.phase]}</Badge>
          {formatKg(goal.goalWeightKg)} by {dateLabel(goal.targetDate)}
        </CardTitle>
        <CardDescription>
          Target from your measured TDEE and weight trend — protein{" "}
          {goal.proteinGPerKg.toFixed(1)} g/kg for this phase.
        </CardDescription>
        <CardAction>
          <Button
            variant="ghost"
            className="text-muted-foreground h-11"
            onClick={() => setAbandonOpen(true)}
          >
            Abandon
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-baseline justify-between">
          <span className="text-3xl font-semibold tabular-nums">
            {formatNumber(goal.currentTargetKcal)}
            <span className="text-muted-foreground text-base font-normal">
              {" "}
              kcal/day
            </span>
          </span>
          {goal.plannedRateKgPerWeek != null && (
            <span className="text-muted-foreground text-xs tabular-nums">
              plan {signedRate(goal.plannedRateKgPerWeek)} kg/wk
            </span>
          )}
        </div>

        {goal.paused && (
          <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
            {goal.pausedReason}
          </p>
        )}

        <div className="space-y-1">
          <div className="text-muted-foreground flex items-baseline justify-between text-xs tabular-nums">
            <span>
              {goal.trendWeightKg != null
                ? `Trend ${formatKg(goal.trendWeightKg)}`
                : "No weight data"}
              {" · "}measured {signedRate(goal.slopeKgPerWeek)} kg/wk
            </span>
            {goal.remainingKg != null && (
              <span>{formatKg(Math.abs(goal.remainingKg))} to go</span>
            )}
          </div>
          {goal.progressPct != null && <Progress percent={goal.progressPct} />}
          <div className="text-muted-foreground flex items-baseline justify-between text-xs">
            <span>Started at {formatKg(goal.startTrendWeightKg)}</span>
            {goal.nextCheckInDay != null && (
              <span>Next check-in {dateLabel(goal.nextCheckInDay)}</span>
            )}
          </div>
        </div>

        {goal.earliestRealisticDate != null && (
          <p className="text-xs text-amber-600 dark:text-amber-500">
            The date now demands more than the safe rate — earliest realistic:{" "}
            {dateLabel(goal.earliestRealisticDate)}.
          </p>
        )}

        {completionDue && (
          <div className="space-y-2 rounded-lg border p-3">
            <p className="text-sm font-medium">
              {goal.completion.trendReached
                ? "Trend weight reached your goal 🎉"
                : "Your target date has passed"}
            </p>
            <p className="text-muted-foreground text-xs">
              {goal.completion.suggestedMaintainKcal != null
                ? `Suggested next step: maintain at ≈ ${formatNumber(goal.completion.suggestedMaintainKcal)} kcal/day (your TDEE).`
                : "Suggested next step: maintain at your TDEE once the estimate is confident again."}
            </p>
            <Button
              className="h-11 w-full"
              disabled={end.isPending}
              onClick={() => end.mutate({ id: goal.id, action: "complete" })}
            >
              Complete goal
            </Button>
          </div>
        )}
      </CardContent>

      <ConfirmSheet
        open={abandonOpen}
        onOpenChange={setAbandonOpen}
        title="Abandon this goal?"
        description="The target and check-in history stay in your log; the intake card falls back to your manual calorie target."
        confirmLabel="Abandon goal"
        busy={end.isPending}
        onConfirm={() => {
          end.mutate(
            { id: goal.id, action: "abandon" },
            { onSuccess: () => setAbandonOpen(false) },
          );
        }}
      />
    </Card>
  );
}
