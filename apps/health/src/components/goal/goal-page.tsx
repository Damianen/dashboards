"use client";

import { GoalActiveCard } from "@/components/goal/goal-active-card";
import { GoalCreateForm } from "@/components/goal/goal-create-form";
import { CheckInHistory } from "@/components/goal/check-in-history";
import { GOAL_PHASE_LABELS } from "@/components/goal/phase";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { dateLabel, formatKg } from "@/lib/format";
import { useGoalStatus, type GoalDTO } from "@/lib/hooks/use-goal";

function LastGoalNote({ goal }: { goal: GoalDTO }) {
  return (
    <p className="text-muted-foreground text-xs">
      Last goal: {GOAL_PHASE_LABELS[goal.phase]} to {formatKg(goal.goalWeightKg)}{" "}
      by {dateLabel(goal.targetDate)} —{" "}
      {goal.status === "COMPLETED" ? "completed" : "abandoned"}.
    </p>
  );
}

/**
 * The Goal screen (a secondary page — reached from the Today intake card and
 * the Insights summary card, not the tab bar): setup with a live plan preview,
 * or the active goal with its check-in history.
 */
export function GoalPage() {
  const { data, isPending, isError, refetch } = useGoalStatus();

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">Goal</h1>
        <p className="text-muted-foreground text-sm">
          A calorie target from your measured TDEE and weight trend — never
          device calories
        </p>
      </header>

      {isPending ? (
        <>
          <Skeleton className="h-56 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
        </>
      ) : isError || data == null ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border p-4">
          <p className="text-muted-foreground text-sm">
            Couldn&apos;t load the goal.
          </p>
          <Button variant="outline" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      ) : data.goal != null ? (
        <>
          <GoalActiveCard goal={data.goal} />
          <CheckInHistory checkIns={data.checkIns} />
        </>
      ) : (
        <>
          <GoalCreateForm />
          {data.lastGoal != null && <LastGoalNote goal={data.lastGoal} />}
          <CheckInHistory checkIns={data.checkIns} />
        </>
      )}
    </div>
  );
}
