"use client";

import { useRef, useState } from "react";
import { Check, Dumbbell, LineChart, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Drawer } from "vaul";

import { Badge } from "@/components/ui/badge";
import { formatNumber } from "@/lib/format";
import { useExerciseHistory } from "@/lib/hooks/use-exercise-history";
import { useDeleteSet } from "@/lib/hooks/use-delete-set";
import { useLogSet } from "@/lib/hooks/use-log-set";
import type { SessionDetailDTO } from "@/lib/hooks/use-session";
import { useUpdateSet } from "@/lib/hooks/use-update-set";
import type { PlainSet } from "@/lib/lifting-grouping";
import { logSetSchema, updateSetSchema } from "@/lib/schemas/lifting";
import { cn } from "@/lib/utils";

type SessionExercise = SessionDetailDTO["exercises"][number];
type SetSuggestion = SessionExercise["suggestions"][number];

// Shared column template so the header and every row line up:
// Set | Previous | kg | Reps | ✓ | (remove, extras only)
const ROW =
  "grid grid-cols-[1.5rem_minmax(0,1fr)_3.5rem_3rem_2.25rem_1.5rem] items-center gap-1.5";

function num(n: number): string {
  return formatNumber(n, 1);
}

/** The Set-column marker: a number for working sets, a "W" badge for warmups. */
function SetBadge({ warmup, badge }: { warmup: boolean; badge: string }) {
  return (
    <div className="flex justify-center">
      {warmup ? (
        <span className="text-[11px] font-bold text-amber-400">W</span>
      ) : (
        <span className="text-muted-foreground text-sm tabular-nums">
          {badge}
        </span>
      )}
    </div>
  );
}

function NumCell({
  value,
  onChange,
  onCommit,
  label,
  inputMode = "decimal",
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  onCommit?: () => void;
  label: string;
  inputMode?: "decimal" | "numeric";
  disabled?: boolean;
}) {
  return (
    <input
      type="text"
      inputMode={inputMode}
      value={value}
      disabled={disabled}
      aria-label={label}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onCommit}
      onFocus={(e) => e.currentTarget.select()}
      className={cn(
        "border-input h-10 w-full rounded-md border bg-transparent text-center text-sm tabular-nums outline-none",
        "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        "disabled:opacity-60",
      )}
    />
  );
}

function CheckButton({
  checked,
  onClick,
  pending,
  disabled,
  label,
}: {
  checked: boolean;
  onClick: () => void;
  pending?: boolean;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={checked}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex size-9 items-center justify-center rounded-md border transition-colors",
        checked
          ? "bg-success border-success text-success-foreground"
          : "border-input text-muted-foreground hover:bg-accent",
        disabled && "opacity-60",
      )}
    >
      {pending ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : (
        <Check className="size-4" aria-hidden />
      )}
    </button>
  );
}

/** The progressive-overload confirm popup for a seeded row whose weight was
 *  bumped. Never blocks logging — it's an editable suggestion either way. */
function BumpPopup({
  weightKg,
  onAccept,
  onDismiss,
}: {
  weightKg: number;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="border-primary/40 bg-primary/5 mt-1 space-y-2 rounded-lg border p-3">
      <p className="text-sm">
        Hit the top of the range last time — bump to{" "}
        <span className="font-medium">{num(weightKg)} kg</span>?
      </p>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onDismiss}
          className="bg-secondary text-secondary-foreground hover:bg-secondary/80 h-10 rounded-md text-sm font-medium transition-colors"
        >
          Keep editing
        </button>
        <button
          type="button"
          onClick={onAccept}
          className="bg-primary text-primary-foreground hover:bg-primary/90 h-10 rounded-md text-sm font-medium transition-colors"
        >
          Accept
        </button>
      </div>
    </div>
  );
}

/** A not-yet-logged set row (a planned placeholder or a user-added extra). Owns
 *  its own input state, seeded once per `seedKey` so a sibling logging never
 *  clobbers a half-typed value. ✓ logs the set. */
function EditableRow({
  exerciseId,
  day,
  sessionId,
  seedKey,
  initialReps,
  initialWeight,
  warmup,
  badge,
  previous,
  suggestion,
  onLogged,
  onRemove,
}: {
  exerciseId: string;
  day: string;
  sessionId: string;
  seedKey: string;
  initialReps: number;
  initialWeight: number | null;
  warmup: boolean;
  badge: string;
  previous: string | null;
  suggestion?: SetSuggestion;
  onLogged?: () => void;
  onRemove?: () => void;
}) {
  const log = useLogSet(day, sessionId);
  const [reps, setReps] = useState(String(initialReps));
  const [weight, setWeight] = useState(
    initialWeight == null ? "" : String(initialWeight),
  );
  const [showBump, setShowBump] = useState(false);
  // Render-time seed: only fires when the row's identity changes, so refetches
  // (a sibling row logging) leave a half-typed value untouched.
  const [seeded, setSeeded] = useState<string | null>(null);
  if (seeded !== seedKey) {
    setSeeded(seedKey);
    setReps(String(initialReps));
    setWeight(initialWeight == null ? "" : String(initialWeight));
    setShowBump(Boolean(suggestion?.weightIncreased));
  }

  const bump =
    showBump && suggestion?.weightIncreased && suggestion.weightKg != null
      ? { reps: suggestion.reps, weightKg: suggestion.weightKg }
      : null;

  function commit() {
    const parsed = logSetSchema.safeParse({
      exerciseId,
      reps: Number(reps),
      weightKg: Number(weight),
      isWarmup: warmup,
    });
    if (!parsed.success) {
      toast.error("Check the set values");
      return;
    }
    log.mutate(parsed.data, { onSuccess: () => onLogged?.() });
  }

  return (
    <div>
      <div className={cn(ROW, "px-1")}>
        <SetBadge warmup={warmup} badge={badge} />
        <span className="text-muted-foreground truncate text-xs tabular-nums">
          {previous ?? "—"}
        </span>
        <NumCell value={weight} onChange={setWeight} label="Weight in kg" />
        <NumCell
          value={reps}
          onChange={setReps}
          label="Reps"
          inputMode="numeric"
        />
        <div className="flex justify-center">
          <CheckButton
            checked={false}
            pending={log.isPending}
            disabled={log.isPending}
            onClick={commit}
            label="Log set"
          />
        </div>
        <div className="flex justify-center">
          {onRemove && (
            <button
              type="button"
              aria-label="Remove set"
              onClick={onRemove}
              className="text-muted-foreground hover:text-destructive flex size-7 items-center justify-center rounded-md transition-colors"
            >
              <Trash2 className="size-4" aria-hidden />
            </button>
          )}
        </div>
      </div>
      {bump && (
        <BumpPopup
          weightKg={bump.weightKg}
          onAccept={() => {
            setReps(String(bump.reps));
            setWeight(String(bump.weightKg));
            setShowBump(false);
          }}
          onDismiss={() => setShowBump(false)}
        />
      )}
    </div>
  );
}

/** An already-logged set: editable inputs (commit on blur via PATCH) with a
 *  filled ✓ that un-logs (deletes) on tap. Keyed by its server values upstream,
 *  so it re-seeds when the server value changes. */
function LoggedRow({
  set,
  badge,
  previous,
  day,
  sessionId,
}: {
  set: PlainSet;
  badge: string;
  previous: string | null;
  day: string;
  sessionId: string;
}) {
  const update = useUpdateSet(day, sessionId);
  const del = useDeleteSet(day, sessionId);
  const [reps, setReps] = useState(String(set.reps));
  const [weight, setWeight] = useState(String(set.weightKg));

  function commit() {
    const r = Number(reps);
    const w = Number(weight);
    if (r === set.reps && w === set.weightKg) return;
    const parsed = updateSetSchema.safeParse({ reps: r, weightKg: w });
    if (!parsed.success) {
      toast.error("Check the set values");
      setReps(String(set.reps));
      setWeight(String(set.weightKg));
      return;
    }
    update.mutate({ id: set.id, input: parsed.data });
  }

  return (
    <div className={cn(ROW, "px-1")}>
      <SetBadge warmup={set.isWarmup} badge={badge} />
      <span className="text-muted-foreground truncate text-xs tabular-nums">
        {previous ?? "—"}
      </span>
      <NumCell
        value={weight}
        onChange={setWeight}
        onCommit={commit}
        label="Weight in kg"
        disabled={del.isPending}
      />
      <NumCell
        value={reps}
        onChange={setReps}
        onCommit={commit}
        label="Reps"
        inputMode="numeric"
        disabled={del.isPending}
      />
      <div className="flex justify-center">
        <CheckButton
          checked
          pending={del.isPending}
          disabled={del.isPending}
          onClick={() => del.mutate(set.id)}
          label="Remove set"
        />
      </div>
      <div />
    </div>
  );
}

/** The graph-icon sheet: recent sessions for this exercise, newest first. */
function HistorySheet({
  exerciseName,
  open,
  onOpenChange,
}: {
  exerciseName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data, isLoading, isError } = useExerciseHistory(
    open ? exerciseName : null,
    8,
  );

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <Drawer.Content
          className="bg-card fixed inset-x-0 bottom-0 z-50 mt-24 flex max-h-[85dvh] flex-col rounded-t-2xl border-t outline-none"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <div className="bg-muted mx-auto mt-3 h-1.5 w-10 shrink-0 rounded-full" />
          <div className="mx-auto w-full max-w-md overflow-y-auto p-4">
            <Drawer.Title className="font-semibold">{exerciseName}</Drawer.Title>
            <Drawer.Description className="text-muted-foreground text-sm">
              Recent history
            </Drawer.Description>
            <div className="mt-3 space-y-3">
              {isLoading ? (
                <p className="text-muted-foreground text-sm">Loading…</p>
              ) : isError || !data || data.length === 0 ? (
                <p className="text-muted-foreground text-sm">No history yet.</p>
              ) : (
                data.map((s) => (
                  <div key={s.sessionId} className="border-b pb-2 last:border-0">
                    <p className="text-sm font-medium">{s.day}</p>
                    <div className="text-muted-foreground mt-1 space-y-0.5 text-sm tabular-nums">
                      {s.sets.map((set, i) => (
                        <p key={i}>
                          {num(Number(set.weightKg))} kg × {set.reps}
                          {set.isWarmup ? " (W)" : ""}
                        </p>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
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
        key={`logged-${set.id}-${set.reps}-${set.weightKg}-${set.isWarmup}`}
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
        key={`logged-${set.id}-${set.reps}-${set.weightKg}-${set.isWarmup}`}
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
          className="hover:bg-accent text-muted-foreground flex size-8 items-center justify-center rounded-md transition-colors"
        >
          <LineChart className="size-4" aria-hidden />
        </button>
        <Drawer.Root open={menuOpen} onOpenChange={setMenuOpen}>
          <Drawer.Trigger asChild>
            <button
              type="button"
              aria-label={`Actions for ${exercise.exerciseName}`}
              className="hover:bg-accent text-muted-foreground flex size-8 items-center justify-center rounded-md transition-colors"
            >
              <Plus className="size-4 rotate-45" aria-hidden />
            </button>
          </Drawer.Trigger>
          <Drawer.Portal>
            <Drawer.Overlay className="fixed inset-0 z-50 bg-black/60" />
            <Drawer.Content
              className="bg-card fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-2xl border-t outline-none"
              style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
            >
              <div className="bg-muted mx-auto mt-3 h-1.5 w-10 shrink-0 rounded-full" />
              <div className="mx-auto w-full max-w-md space-y-1 p-4">
                <Drawer.Title className="px-3 pb-1 font-semibold">
                  {exercise.exerciseName}
                </Drawer.Title>
                <Drawer.Description className="sr-only">
                  Exercise actions
                </Drawer.Description>
                <button
                  type="button"
                  onClick={addWarmup}
                  className="hover:bg-accent flex min-h-12 w-full items-center gap-3 rounded-md px-3 text-left text-base font-medium transition-colors"
                >
                  <Dumbbell className="size-5" aria-hidden />
                  Add warmup set
                </button>
              </div>
            </Drawer.Content>
          </Drawer.Portal>
        </Drawer.Root>
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
        <span />
      </div>

      <div className="mt-1 space-y-1">{rows}</div>

      <button
        type="button"
        onClick={addWorking}
        className="hover:bg-accent text-muted-foreground mt-2 flex h-10 w-full items-center justify-center gap-1 rounded-md text-sm font-medium transition-colors"
      >
        <Plus className="size-4" aria-hidden />
        Add Set
      </button>

      <HistorySheet
        exerciseName={exercise.exerciseName}
        open={historyOpen}
        onOpenChange={setHistoryOpen}
      />
    </div>
  );
}
