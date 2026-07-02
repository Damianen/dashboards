"use client";

import { useRef, useState } from "react";
import { Dumbbell, LineChart, Plus } from "lucide-react";

import { ExerciseHistorySheet } from "@/components/lifting/exercise-history-sheet";
import {
  EditableRow,
  LoggedRow,
  ROW,
} from "@/components/lifting/set-table-row";
import { Badge } from "@/components/ui/badge";
import {
  BottomSheet,
  BottomSheetAction,
} from "@/components/ui/bottom-sheet";
import { formatNumber } from "@/lib/format";
import type { SessionDetailDTO } from "@/lib/hooks/use-session";
import { cn } from "@/lib/utils";

type SessionExercise = SessionDetailDTO["exercises"][number];

function num(n: number): string {
  return formatNumber(n, 1);
}

/** The header progress chip (REPS: sets done / target; VOLUME: kg / target). */
function progressChip(exercise: SessionExercise): {
  text: string;
  complete: boolean;
} | null {
  const plan = exercise.plan;
  if (!plan) return null;
  const complete = exercise.progress?.complete ?? false;
  if (plan.targetType === "REPS") {
    if (plan.targetSets == null) return null;
    return {
      text: `${exercise.progress?.setsDone ?? 0}/${plan.targetSets} sets`,
      complete,
    };
  }
  return {
    text: `${num(exercise.progress?.actualVolumeKg ?? 0)}/${num(
      plan.targetVolumeKg ?? 0,
    )} kg`,
    complete,
  };
}

/**
 * One exercise in the active logger: a blue title + graph + "…" menu, then the
 * Set | Previous | kg | Reps | ✓ table. Warmup rows render FIRST (the template's
 * snapshotted warmups, prefilled from last session / the definition), then the
 * working sets. Within each section: logged (editable + deletable) → planned
 * placeholders → user-added extras. "+ Add set" appends a working row; the "…"
 * menu adds a warmup row.
 */
export function ExerciseSetTable({
  exercise,
  day,
  sessionId,
}: {
  exercise: SessionExercise;
  day: string;
  sessionId: string;
}) {
  const [extraRows, setExtraRows] = useState<
    { uid: string; warmup: boolean }[]
  >([]);
  const uidRef = useRef(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const plan = exercise.plan;
  const loggedSets = exercise.sets?.sets ?? [];
  const suggestions = exercise.suggestions;
  const prevWorking = exercise.previousSets.filter((s) => !s.isWarmup);
  const prevWarmup = exercise.previousSets.filter((s) => s.isWarmup);
  const targetSets =
    plan?.targetType === "REPS" ? (plan.targetSets ?? 0) : 0;
  const workingDone =
    exercise.progress?.setsDone ??
    loggedSets.filter((s) => !s.isWarmup).length;
  const lastLoggedWorking = [...loggedSets].reverse().find((s) => !s.isWarmup);

  function nextUid() {
    uidRef.current += 1;
    return `x${uidRef.current}`;
  }
  function addWorking() {
    setExtraRows((r) => [...r, { uid: nextUid(), warmup: false }]);
  }
  function addWarmup() {
    setMenuOpen(false);
    setExtraRows((r) => [...r, { uid: nextUid(), warmup: true }]);
  }
  function removeExtra(uid: string) {
    setExtraRows((r) => r.filter((x) => x.uid !== uid));
  }

  // Build the ordered row list, tracking the working/warmup ordinals that drive
  // both the Set badge and the "Previous" mapping (k-th working ↔ k-th prior
  // working set; k-th warmup ↔ k-th prior warmup set).
  let working = 0;
  let warm = 0;
  const prevFor = (warmup: boolean): string | null => {
    if (warmup) {
      const p = prevWarmup[warm - 1];
      return p ? `${num(p.weightKg)} × ${p.reps} (W)` : null;
    }
    const p = prevWorking[working - 1];
    return p ? `${num(p.weightKg)} × ${p.reps}` : null;
  };

  // Two sections, warmups FIRST then working sets. Each section has its own
  // ordinal counter so the "Previous" mapping stays k-th ↔ k-th within its kind.
  const loggedWarmups = loggedSets.filter((s) => s.isWarmup);
  const loggedWorking = loggedSets.filter((s) => !s.isWarmup);
  const warmupSuggestions = exercise.warmupSuggestions;
  const warmupDone = loggedWarmups.length;
  const extraWarmups = extraRows.filter((x) => x.warmup);
  const extraWorking = extraRows.filter((x) => !x.warmup);

  const warmupRows: React.ReactNode[] = [];
  const workingRows: React.ReactNode[] = [];

  // --- Warmups: logged → planned (from the template's warmup defs) → extras ---
  for (const set of loggedWarmups) {
    warm++;
    warmupRows.push(
      <LoggedRow
        key={`logged-${set.id}-${set.reps}-${set.weightKg}-${set.rpe}-${set.isWarmup}`}
        set={set}
        badge="W"
        previous={prevFor(true)}
        day={day}
        sessionId={sessionId}
      />,
    );
  }
  for (let pos = warmupDone + 1; pos <= warmupSuggestions.length; pos++) {
    warm++;
    const s = warmupSuggestions[pos - 1];
    warmupRows.push(
      <EditableRow
        key={`warmup-plan-${pos}`}
        exerciseId={exercise.exerciseId}
        day={day}
        sessionId={sessionId}
        seedKey={`${exercise.exerciseId}:warmup:${pos}`}
        initialReps={s?.reps ?? prevWarmup[pos - 1]?.reps ?? 8}
        initialWeight={s?.weightKg ?? prevWarmup[pos - 1]?.weightKg ?? null}
        warmup
        badge="W"
        previous={prevFor(true)}
      />,
    );
  }
  for (const ex of extraWarmups) {
    warm++;
    const p = prevWarmup[warm - 1];
    warmupRows.push(
      <EditableRow
        key={`extra-${ex.uid}`}
        exerciseId={exercise.exerciseId}
        day={day}
        sessionId={sessionId}
        seedKey={`${exercise.exerciseId}:extra:${ex.uid}`}
        initialReps={p?.reps ?? 8}
        initialWeight={p?.weightKg ?? null}
        warmup
        badge="W"
        previous={prevFor(true)}
        onLogged={() => removeExtra(ex.uid)}
        onRemove={() => removeExtra(ex.uid)}
      />,
    );
  }

  // --- Working sets: logged → planned placeholders → extras (unchanged logic) ---
  for (const set of loggedWorking) {
    working++;
    workingRows.push(
      <LoggedRow
        key={`logged-${set.id}-${set.reps}-${set.weightKg}-${set.rpe}-${set.isWarmup}`}
        set={set}
        badge={String(working)}
        previous={prevFor(false)}
        day={day}
        sessionId={sessionId}
      />,
    );
  }
  for (let pos = workingDone + 1; pos <= targetSets; pos++) {
    working++;
    const s = suggestions[pos - 1];
    const initialWeight =
      s?.weightKg ??
      plan?.targetWeightKg ??
      prevWorking[pos - 1]?.weightKg ??
      prevWorking[prevWorking.length - 1]?.weightKg ??
      null;
    workingRows.push(
      <EditableRow
        key={`plan-${pos}`}
        exerciseId={exercise.exerciseId}
        day={day}
        sessionId={sessionId}
        seedKey={`${exercise.exerciseId}:plan:${pos}`}
        initialReps={s?.reps ?? plan?.repMin ?? 8}
        initialWeight={initialWeight}
        warmup={false}
        badge={String(working)}
        previous={prevFor(false)}
        suggestion={s}
      />,
    );
  }
  for (const ex of extraWorking) {
    working++;
    const s = suggestions[working - 1];
    const initialWeight =
      s?.weightKg ??
      lastLoggedWorking?.weightKg ??
      plan?.targetWeightKg ??
      prevWorking[prevWorking.length - 1]?.weightKg ??
      null;
    workingRows.push(
      <EditableRow
        key={`extra-${ex.uid}`}
        exerciseId={exercise.exerciseId}
        day={day}
        sessionId={sessionId}
        seedKey={`${exercise.exerciseId}:extra:${ex.uid}`}
        initialReps={s?.reps ?? lastLoggedWorking?.reps ?? plan?.repMin ?? 8}
        initialWeight={initialWeight}
        warmup={false}
        badge={String(working)}
        previous={prevFor(false)}
        suggestion={s}
        onLogged={() => removeExtra(ex.uid)}
        onRemove={() => removeExtra(ex.uid)}
      />,
    );
  }

  const rows = [...warmupRows, ...workingRows];

  const chip = progressChip(exercise);

  return (
    <div className="bg-card rounded-xl border p-3">
      <div className="flex items-center gap-1">
        <h3 className="text-accent-blue min-w-0 flex-1 truncate font-semibold">
          {exercise.exerciseName}
        </h3>
        {chip && (
          <Badge
            variant={chip.complete ? "default" : "outline"}
            className="tabular-nums"
          >
            {chip.text}
          </Badge>
        )}
        <button
          type="button"
          aria-label={`History for ${exercise.exerciseName}`}
          onClick={() => setHistoryOpen(true)}
          className="hover:bg-accent text-muted-foreground flex size-11 items-center justify-center rounded-md transition-colors"
        >
          <LineChart className="size-4" aria-hidden />
        </button>
        <BottomSheet
          open={menuOpen}
          onOpenChange={setMenuOpen}
          variant="menu"
          title={exercise.exerciseName}
          description="Exercise actions"
          showTitle
          titleClassName="px-3 pb-1 font-semibold"
          bodyClassName="space-y-1"
          trigger={
            <button
              type="button"
              aria-label={`Actions for ${exercise.exerciseName}`}
              className="hover:bg-accent text-muted-foreground flex size-11 items-center justify-center rounded-md transition-colors"
            >
              <Plus className="size-4 rotate-45" aria-hidden />
            </button>
          }
        >
          <BottomSheetAction
            icon={<Dumbbell className="size-5" aria-hidden />}
            label="Add warmup set"
            onClick={addWarmup}
          />
        </BottomSheet>
      </div>

      <div
        className={cn(
          ROW,
          "text-muted-foreground mt-2 px-1 text-[11px] font-medium",
        )}
      >
        <span className="text-center">Set</span>
        <span>Previous</span>
        <span className="text-center">kg</span>
        <span className="text-center">Reps</span>
        <span />
        <span className="text-center">RPE</span>
      </div>

      <div className="mt-1 space-y-1">{rows}</div>

      <button
        type="button"
        onClick={addWorking}
        className="hover:bg-accent text-muted-foreground mt-2 flex h-11 w-full items-center justify-center gap-1 rounded-md text-sm font-medium transition-colors"
      >
        <Plus className="size-4" aria-hidden />
        Add Set
      </button>

      <ExerciseHistorySheet
        exerciseName={exercise.exerciseName}
        open={historyOpen}
        onOpenChange={setHistoryOpen}
      />
    </div>
  );
}
