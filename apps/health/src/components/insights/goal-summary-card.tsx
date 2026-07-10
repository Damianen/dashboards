"use client";

import Link from "next/link";
import { ChevronRight, Target } from "lucide-react";

import { GOAL_PHASE_LABELS } from "@/components/goal/phase";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { dateLabel, formatKg, formatNumber } from "@/lib/format";
import { useGoalStatus } from "@/lib/hooks/use-goal";

/**
 * A compact status line for the goal feature — the Insights-side entry point
 * to the /goal screen (the bottom nav is full). Renders nothing while loading
 * or on error: the goal screen itself owns those states.
 */
export function GoalSummaryCard() {
  const { data } = useGoalStatus();
  if (data === undefined) return null;

  const goal = data.goal;
  const pendingCheckIn =
    goal != null && data.checkIns.some((c) => c.status === "PROPOSED");

  return (
    <Card className="py-4">
      <CardContent className="px-4">
        <Link href="/goal" className="flex min-h-11 items-center gap-3">
          <Target className="text-muted-foreground size-4 shrink-0" />
          {goal == null ? (
            <span className="text-sm">
              Set a goal — a calorie target from your TDEE and weight trend
            </span>
          ) : (
            <span className="flex min-w-0 flex-1 items-center gap-2 text-sm">
              <Badge variant="secondary">{GOAL_PHASE_LABELS[goal.phase]}</Badge>
              <span className="truncate tabular-nums">
                {formatNumber(goal.currentTargetKcal)} kcal/day ·{" "}
                {formatKg(goal.goalWeightKg)} by {dateLabel(goal.targetDate)}
              </span>
              {goal.paused && <Badge variant="outline">Paused</Badge>}
              {pendingCheckIn && <Badge>Check-in</Badge>}
            </span>
          )}
          <ChevronRight className="text-muted-foreground ml-auto size-4 shrink-0" />
        </Link>
      </CardContent>
    </Card>
  );
}
