"use client";

import { Plus } from "lucide-react";

import type { SheetTarget } from "@/components/lifting/session-set-sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatNumber } from "@/lib/format";
import type { PlainSet } from "@/lib/lifting-grouping";
import type { SessionDetailDTO } from "@/lib/hooks/use-session";
import { classifyWorkingSet, type SetClass } from "@/lib/session-progress";
import { cn } from "@/lib/utils";

type SessionExercise = SessionDetailDTO["exercises"][number];
type Plan = NonNullable<SessionExercise["plan"]>;

/** A subtle leading marker: filled for in-range, a hollow ring for out-of-range,
 *  muted for warmups / neutral (VOLUME or unranged) sets. */
function Marker({ cls }: { cls: SetClass }) {
  if (cls === "in-range") {
    return (
      <span className="bg-primary size-1.5 shrink-0 rounded-full" aria-hidden />
    );
  }
  if (cls === "out-of-range") {
    return (
      <span
        className="border-muted-foreground/60 size-1.5 shrink-0 rounded-full border"
        aria-hidden
      />
    );
  }
  return (
    <span
      className="bg-muted-foreground/30 size-1.5 shrink-0 rounded-full"
      aria-hidden
    />
  );
}

function SetLine({ set, plan }: { set: PlainSet; plan: Plan }) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 text-sm tabular-nums",
        set.isWarmup && "text-muted-foreground",
      )}
    >
      <Marker cls={classifyWorkingSet(set, plan)} />
      <span>
        {set.reps} × {formatNumber(set.weightKg, 1)} kg
      </span>
      {set.rpe != null && (
        <span className="text-muted-foreground">
          @ RPE {formatNumber(set.rpe, 1)}
        </span>
      )}
      {set.isWarmup && (
        <Badge variant="outline" className="text-[10px]">
          warmup
        </Badge>
      )}
    </div>
  );
}

/** The plan's target as a one-line string. */
function targetLine(plan: Plan): string {
  if (plan.targetType === "REPS") {
    const base = `${plan.targetSets} × ${plan.repMin}–${plan.repMax}`;
    return plan.targetWeightKg != null
      ? `${base} @ ${formatNumber(plan.targetWeightKg, 1)} kg`
      : base;
  }
  return `target ${formatNumber(plan.targetVolumeKg ?? 0)} kg`;
}

/** The progress chip text for the plan's mode. */
function progressChip(
  plan: Plan,
  progress: SessionExercise["progress"],
): string {
  if (plan.targetType === "REPS") {
    return `${progress?.setsDone ?? 0}/${plan.targetSets} sets`;
  }
  return `${formatNumber(progress?.actualVolumeKg ?? 0)}/${formatNumber(
    plan.targetVolumeKg ?? 0,
  )} kg`;
}

/**
 * One planned exercise: its target, a progress chip (filled when complete), the
 * sets logged so far (each tagged in/out of range), and an "Add set" button that
 * opens the logging sheet prefilled — weight from the target, else the last set
 * logged here, else (in the form) last time.
 */
export function PlannedExerciseCard({
  exercise,
  onAddSet,
}: {
  exercise: SessionExercise;
  onAddSet: (target: SheetTarget) => void;
}) {
  const plan = exercise.plan;
  if (!plan) return null; // the session view only passes planned exercises here

  const logged = exercise.sets?.sets ?? [];
  const lastWorkingWeight = [...logged]
    .reverse()
    .find((s) => !s.isWarmup)?.weightKg;
  const seedWeightKg = plan.targetWeightKg ?? lastWorkingWeight ?? undefined;
  const complete = exercise.progress?.complete ?? false;
  // The next set to log is one past the working sets already done — its
  // suggestion (and the bump popup) seeds the form on open.
  const startPosition = (exercise.progress?.setsDone ?? 0) + 1;

  return (
    <Card className="gap-0 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium">{exercise.exerciseName}</p>
          <p className="text-muted-foreground text-sm">{targetLine(plan)}</p>
        </div>
        <Badge
          variant={complete ? "default" : "outline"}
          className="tabular-nums"
        >
          {progressChip(plan, exercise.progress)}
        </Badge>
      </div>

      {logged.length > 0 && (
        <div className="mt-3 space-y-0.5 pl-1">
          {logged.map((set) => (
            <SetLine key={set.id} set={set} plan={plan} />
          ))}
        </div>
      )}

      <Button
        type="button"
        variant="outline"
        className="mt-3 h-11 w-full"
        onClick={() =>
          onAddSet({
            exerciseId: exercise.exerciseId,
            exerciseName: exercise.exerciseName,
            seedWeightKg,
            repHint: { repMin: plan.repMin, repMax: plan.repMax },
            suggestions: exercise.suggestions,
            startPosition,
          })
        }
      >
        <Plus className="size-4" aria-hidden />
        Add set
      </Button>
    </Card>
  );
}
