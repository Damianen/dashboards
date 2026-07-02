"use client";

import { useState } from "react";
import { Check, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { BumpPopup } from "@/components/lifting/bump-popup";
import { useDeleteSet } from "@/lib/hooks/use-delete-set";
import { useLogSet } from "@/lib/hooks/use-log-set";
import type { SessionDetailDTO } from "@/lib/hooks/use-session";
import { useUpdateSet } from "@/lib/hooks/use-update-set";
import type { PlainSet } from "@/lib/lifting-grouping";
import { logSetSchema, updateSetSchema } from "@/lib/schemas/lifting";
import { cn } from "@/lib/utils";

type SetSuggestion =
  SessionDetailDTO["exercises"][number]["suggestions"][number];

// Shared column template so the header and every row line up:
// Set | Previous | kg | Reps | ✓ | (RPE once logged; remove on extras)
// The two trailing columns are 2.75rem so their controls reach 44px hit areas.
export const ROW =
  "grid grid-cols-[1.5rem_minmax(0,1fr)_3.5rem_3rem_2.75rem_2.75rem] items-center gap-1.5";

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
        "border-input h-11 w-full rounded-md border bg-transparent text-center text-sm tabular-nums outline-none",
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
        "flex size-11 items-center justify-center rounded-md border transition-colors",
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

/** A not-yet-logged set row (a planned placeholder or a user-added extra). Owns
 *  its own input state, seeded once per `seedKey` so a sibling logging never
 *  clobbers a half-typed value. ✓ logs the set. */
export function EditableRow({
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
              className="text-muted-foreground hover:text-destructive flex size-11 items-center justify-center rounded-md transition-colors"
            >
              <Trash2 className="size-4" aria-hidden />
            </button>
          )}
        </div>
      </div>
      {bump && (
        <BumpPopup
          className="mt-1"
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
 *  filled ✓ that un-logs (deletes) on tap. RPE is a post-set rating, so its cell
 *  lives here (the trailing column EditableRow uses for remove) — rate the set
 *  after ✓ flips the row. Keyed by its server values upstream, so it re-seeds
 *  when the server value changes. */
export function LoggedRow({
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
  const [rpe, setRpe] = useState(set.rpe == null ? "" : String(set.rpe));

  function commit() {
    const r = Number(reps);
    const w = Number(weight);
    // The ""→null branch must run before Number(): Number("") is 0, which
    // would fail the 1–10 bound instead of clearing the RPE.
    const rpeVal = rpe.trim() === "" ? null : Number(rpe);
    if (r === set.reps && w === set.weightKg && rpeVal === set.rpe) return;
    const parsed = updateSetSchema.safeParse({
      reps: r,
      weightKg: w,
      rpe: rpeVal,
    });
    if (!parsed.success) {
      toast.error("Check the set values");
      setReps(String(set.reps));
      setWeight(String(set.weightKg));
      setRpe(set.rpe == null ? "" : String(set.rpe));
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
      <NumCell
        value={rpe}
        onChange={setRpe}
        onCommit={commit}
        label="RPE"
        disabled={del.isPending}
      />
    </div>
  );
}
