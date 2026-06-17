"use client";

import { useState } from "react";
import { ChevronLeft } from "lucide-react";
import { toast } from "sonner";

import { LastTime } from "@/components/lifting/last-time";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Stepper } from "@/components/ui/stepper";
import { useExerciseHistory } from "@/lib/hooks/use-exercise-history";
import { useLogSet } from "@/lib/hooks/use-log-set";
import { logSetSchema } from "@/lib/schemas/lifting";
import { cn } from "@/lib/utils";

/** The plan's rep range as a hint string, or null when there's no useful range. */
function repRangeHint(hint?: {
  repMin: number | null;
  repMax: number | null;
}): string | null {
  if (!hint) return null;
  const { repMin, repMax } = hint;
  if (repMin != null && repMax != null) return `${repMin}–${repMax} reps`;
  if (repMin != null) return `≥${repMin} reps`;
  if (repMax != null) return `≤${repMax} reps`;
  return null;
}

/**
 * Log sets for one exercise. Fields seed from the exercise's last session, and
 * after each submit the sheet stays open with the fields untouched — so logging
 * set 2 and 3 is a single tap each. Warmups never affect volume.
 *
 * From a planned session, `seedWeightKg` (the plan's target / last actual) takes
 * priority over the last-time weight, `repHint` shows the plan's rep range, and
 * `sessionId` makes the logged set refetch that session's detail.
 */
export function SetForm({
  exercise,
  day,
  onBack,
  seedWeightKg,
  repHint,
  sessionId,
}: {
  exercise: { id: string; name: string };
  day: string;
  onBack: () => void;
  seedWeightKg?: number;
  repHint?: { repMin: number | null; repMax: number | null };
  sessionId?: string;
}) {
  const [reps, setReps] = useState(8);
  const [weight, setWeight] = useState(seedWeightKg ?? 20);
  const [rpe, setRpe] = useState<number | null>(null);
  const [warmup, setWarmup] = useState(false);

  const { mutate, isPending } = useLogSet(day, sessionId);

  // Seed reps/weight from the last working set of the most recent session, once,
  // before the user edits anything (React's render-time "store info from previous
  // renders" pattern). Shares the cached history with <LastTime>; the form remounts
  // per exercise, so `seeded` resets cleanly. A provided `seedWeightKg` wins for
  // weight, so the history seed only fills weight when none was given.
  const { data: history } = useExerciseHistory(exercise.name, 1);
  const [seeded, setSeeded] = useState(false);
  const working = history?.[0]?.sets.filter((s) => !s.isWarmup) ?? [];
  const seed = working[working.length - 1];
  if (!seeded && seed) {
    setSeeded(true);
    setReps(seed.reps);
    if (seedWeightKg == null) setWeight(Number(seed.weightKg));
  }

  const hint = repRangeHint(repHint);

  function submit() {
    const parsed = logSetSchema.safeParse({
      exerciseId: exercise.id,
      reps,
      weightKg: weight,
      rpe: rpe ?? undefined,
      isWarmup: warmup,
    });
    if (!parsed.success) {
      toast.error("Check the set values");
      return;
    }
    // Keep field state as-is for one-tap repeats; don't read the response back.
    mutate(parsed.data);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to exercises"
          className="hover:bg-accent flex size-9 items-center justify-center rounded-md transition-colors"
        >
          <ChevronLeft className="size-5" aria-hidden />
        </button>
        <h2 className="text-base font-semibold">{exercise.name}</h2>
      </div>

      <LastTime exercise={exercise.name} />

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="set-reps">Reps</Label>
          {hint && (
            <span className="text-muted-foreground text-xs">Target {hint}</span>
          )}
        </div>
        <Stepper
          id="set-reps"
          label="reps"
          value={reps}
          onChange={setReps}
          step={1}
          min={1}
          max={100}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="set-weight">Weight (kg)</Label>
        <Stepper
          id="set-weight"
          label="weight in kilograms"
          value={weight}
          onChange={setWeight}
          step={2.5}
          min={0}
          max={500}
          inputMode="decimal"
        />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="set-rpe">RPE</Label>
          <button
            type="button"
            onClick={() => setRpe((r) => (r === null ? 8 : null))}
            className="text-muted-foreground hover:text-foreground text-sm font-medium transition-colors"
          >
            {rpe === null ? "Add" : "Remove"}
          </button>
        </div>
        {rpe !== null && (
          <Stepper
            id="set-rpe"
            label="RPE"
            value={rpe}
            onChange={setRpe}
            step={0.5}
            min={1}
            max={10}
            inputMode="decimal"
          />
        )}
      </div>

      <div className="bg-muted grid grid-cols-2 gap-1 rounded-lg p-1">
        {[
          { warm: false, label: "Working" },
          { warm: true, label: "Warmup" },
        ].map((opt) => (
          <button
            key={opt.label}
            type="button"
            onClick={() => setWarmup(opt.warm)}
            className={cn(
              "rounded-md py-2 text-sm font-medium transition-colors",
              warmup === opt.warm
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <Button
        type="button"
        className="h-12 w-full text-base"
        onClick={submit}
        disabled={isPending}
      >
        Log set
      </Button>
    </div>
  );
}
