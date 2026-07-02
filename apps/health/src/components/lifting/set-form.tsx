"use client";

import { useState } from "react";
import { ChevronLeft } from "lucide-react";
import { toast } from "sonner";

import { BumpPopup } from "@/components/lifting/bump-popup";
import { LastTime } from "@/components/lifting/last-time";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Segmented } from "@/components/ui/segmented";
import { Stepper } from "@/components/ui/stepper";
import { useExerciseHistory } from "@/lib/hooks/use-exercise-history";
import type { SessionDetailDTO } from "@/lib/hooks/use-session";
import { useLogSet } from "@/lib/hooks/use-log-set";
import { logSetSchema } from "@/lib/schemas/lifting";

/** A progressive-overload prefill for one target set position. */
type SetSuggestion =
  SessionDetailDTO["exercises"][number]["suggestions"][number];

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
 *
 * `suggestions` (progressive-overload prefills, one per set position) override the
 * seeds when present: each set's reps/weight start at its suggestion, and a set
 * whose weight was bumped shows a confirm popup. They're editable defaults only —
 * logging always sends whatever is in the inputs.
 */
export function SetForm({
  exercise,
  day,
  onBack,
  seedWeightKg,
  repHint,
  sessionId,
  suggestions,
  startPosition,
}: {
  exercise: { id: string; name: string };
  day: string;
  onBack: () => void;
  seedWeightKg?: number;
  repHint?: { repMin: number | null; repMax: number | null };
  sessionId?: string;
  suggestions?: SetSuggestion[];
  startPosition?: number;
}) {
  const [reps, setReps] = useState(8);
  const [weight, setWeight] = useState(seedWeightKg ?? 20);
  const [rpe, setRpe] = useState<number | null>(null);
  const [warmup, setWarmup] = useState(false);
  // The set position currently being logged; advances after each working set so
  // each set seeds from its own suggestion.
  const [position, setPosition] = useState(startPosition ?? 1);
  const [showBump, setShowBump] = useState(false);

  const { mutate, isPending } = useLogSet(day, sessionId);

  const hasSuggestions = (suggestions?.length ?? 0) > 0;
  // Clamp past the last suggestion so extra sets keep the final position's value.
  const suggestion = hasSuggestions
    ? suggestions![Math.min(position, suggestions!.length) - 1]
    : undefined;

  // Seed reps/weight from this position's suggestion whenever the position changes
  // (incl. first mount), using React's render-time "derive from props" pattern. The
  // bump popup shows for a position whose weight was force-increased.
  const [seededPos, setSeededPos] = useState<number | null>(null);
  if (suggestion && seededPos !== position) {
    setSeededPos(position);
    setReps(suggestion.reps);
    if (suggestion.weightKg != null) setWeight(suggestion.weightKg);
    setShowBump(suggestion.weightIncreased);
  }

  // Fallback when there are no suggestions (ad-hoc / VOLUME): seed once from the
  // last working set of the most recent session. Shares the cached history with
  // <LastTime>; `seedWeightKg` still wins for weight when given.
  const { data: history } = useExerciseHistory(exercise.name, 1);
  const [seeded, setSeeded] = useState(false);
  const working = history?.[0]?.sets.filter((s) => !s.isWarmup) ?? [];
  const seed = working[working.length - 1];
  if (!hasSuggestions && !seeded && seed) {
    setSeeded(true);
    setReps(seed.reps);
    if (seedWeightKg == null) setWeight(Number(seed.weightKg));
  }

  const hint = repRangeHint(repHint);
  // Captured (and narrowed) so the popup handlers see concrete numbers.
  const bump =
    showBump && suggestion?.weightIncreased && suggestion.weightKg != null
      ? { reps: suggestion.reps, weightKg: suggestion.weightKg }
      : null;

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
    const wasWorking = !warmup;
    // Keep field state as-is for one-tap repeats; don't read the response back.
    // Advance to the next position's suggestion only after a logged working set
    // (warmups don't consume a planned slot).
    mutate(parsed.data, {
      onSuccess: () => {
        if (wasWorking && hasSuggestions) setPosition((p) => p + 1);
      },
    });
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

      {bump && (
        <BumpPopup
          weightKg={bump.weightKg}
          onDismiss={() => setShowBump(false)}
          onAccept={() => {
            setReps(bump.reps);
            setWeight(bump.weightKg);
            setShowBump(false);
          }}
        />
      )}

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

      <Segmented<"working" | "warmup">
        value={warmup ? "warmup" : "working"}
        onChange={(v) => setWarmup(v === "warmup")}
        ariaLabel="Set type"
        options={[
          { value: "working", label: "Working" },
          { value: "warmup", label: "Warmup" },
        ]}
      />

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
