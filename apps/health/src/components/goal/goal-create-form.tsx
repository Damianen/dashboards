"use client";

import { useState } from "react";

import { GOAL_PHASE_LABELS, signedRate } from "@/components/goal/phase";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { shiftDay, todayLocal } from "@/lib/dates";
import { httpErrorMessage } from "@/lib/fetcher";
import { dateLabel, formatNumber } from "@/lib/format";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { useGoalPreview, type GoalPlan } from "@/lib/hooks/use-goal";
import { useCreateGoal } from "@/lib/hooks/use-goal-mutations";
import { createGoalSchema } from "@/lib/schemas/goals";

/** The live plan the entered goal implies — including the clamp warning. */
function PlanPreview({ plan }: { plan: GoalPlan }) {
  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex items-center justify-between">
        <Badge variant="secondary">{GOAL_PHASE_LABELS[plan.phase]}</Badge>
        <span className="text-muted-foreground text-xs">
          TDEE {formatNumber(plan.tdeeKcal)} kcal · {plan.tdeeConfidence}{" "}
          confidence
        </span>
      </div>
      <div className="flex items-baseline justify-between">
        <span className="text-2xl font-semibold tabular-nums">
          {formatNumber(plan.targetKcal)}
          <span className="text-muted-foreground text-base font-normal">
            {" "}
            kcal/day
          </span>
        </span>
        <span className="text-muted-foreground text-xs tabular-nums">
          {signedRate(plan.plannedRateKgPerWeek)} kg/wk · protein{" "}
          {plan.proteinGPerKg.toFixed(1)} g/kg
        </span>
      </div>
      {plan.rateCapped && plan.earliestRealisticDate != null && (
        <p className="text-xs text-amber-600 dark:text-amber-500">
          That date needs {signedRate(plan.requiredRateKgPerWeek)} kg/wk —
          capped at the safe {signedRate(plan.plannedRateKgPerWeek)}. Earliest
          realistic: {dateLabel(plan.earliestRealisticDate)}.
        </p>
      )}
      {plan.bound === "floor" && (
        <p className="text-xs text-amber-600 dark:text-amber-500">
          Held at the absolute calorie floor.
        </p>
      )}
      {plan.bound === "maxDeficitPct" && (
        <p className="text-xs text-amber-600 dark:text-amber-500">
          Held at the max-deficit bound (25% of TDEE).
        </p>
      )}
      {plan.bound === "maxSurplusPct" && (
        <p className="text-xs text-amber-600 dark:text-amber-500">
          Held at the max-surplus bound (+20% of TDEE).
        </p>
      )}
    </div>
  );
}

/**
 * Goal setup: a weight and a date — the plan (phase, rate, daily target,
 * protein factor) derives live from the empirical TDEE and the weight trend.
 * A too-aggressive date previews clamped, with the earliest realistic date.
 */
export function GoalCreateForm() {
  const today = todayLocal();
  const minDate = shiftDay(today, 7);
  const [goalWeightKg, setGoalWeightKg] = useState("");
  const [targetDate, setTargetDate] = useState("");

  const debounced = useDebouncedValue({ goalWeightKg, targetDate }, 400);
  const parsed = createGoalSchema.safeParse(debounced);
  const preview = useGoalPreview(debounced, parsed.success);
  const create = useCreateGoal();

  function handleCreate() {
    const submit = createGoalSchema.safeParse({ goalWeightKg, targetDate });
    if (!submit.success) return;
    create.mutate(submit.data);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Set a goal</CardTitle>
        <CardDescription>
          A weight and a date. The daily calorie target derives from your
          measured TDEE and weight trend — never device calories — and a weekly
          check-in keeps it honest.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-3">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="goal-weight">Goal weight (kg)</Label>
            <Input
              id="goal-weight"
              type="number"
              inputMode="decimal"
              min={20}
              max={500}
              step={0.1}
              placeholder="e.g. 76"
              value={goalWeightKg}
              onChange={(e) => setGoalWeightKg(e.target.value)}
            />
          </div>
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="goal-date">Target date</Label>
            <Input
              id="goal-date"
              type="date"
              min={minDate}
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
            />
          </div>
        </div>

        {parsed.success && preview.isPending && (
          <Skeleton className="h-24 w-full rounded-lg" />
        )}
        {preview.isError && (
          <p className="text-muted-foreground rounded-lg border p-3 text-sm">
            {httpErrorMessage(
              preview.error,
              "Couldn't preview the plan — try again.",
            )}
          </p>
        )}
        {preview.data != null && <PlanPreview plan={preview.data} />}

        <Button
          className="h-11 w-full"
          disabled={!parsed.success || preview.data == null || create.isPending}
          onClick={handleCreate}
        >
          Start goal
        </Button>
      </CardContent>
    </Card>
  );
}
