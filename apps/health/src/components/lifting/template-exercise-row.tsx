"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Segmented } from "@/components/ui/segmented";
import { Stepper } from "@/components/ui/stepper";

/** One pre-defined warmup set in the editor. Both weight values are always present
 *  (with defaults) so toggling kg↔% preserves them; a stable `rowId` keys the row. */
export interface EditorWarmup {
  rowId: string;
  reps: number;
  weightMode: "ABSOLUTE" | "PERCENT";
  /** Absolute kg, used in ABSOLUTE mode. */
  weightKg: number;
  /** Percentage of the working weight, used in PERCENT mode. */
  percentOfWorking: number;
}

/** One editable exercise in the template editor. All fields for both target modes
 *  are always present (with defaults) so toggling REPS↔VOLUME preserves values. A
 *  stable `rowId` keys the row across reorders. */
export interface EditorExercise {
  rowId: string;
  exerciseId: string;
  exerciseName: string;
  muscleGroup: string | null;
  targetType: "REPS" | "VOLUME";
  targetSets: number;
  repMin: number;
  repMax: number;
  /** null = no working weight set (optional). */
  targetWeightKg: number | null;
  /** Weight added each progression step; always set, defaults to 2.5. */
  weightIncrementKg: number;
  targetVolumeKg: number;
  /** null = no rest set (optional). */
  restSec: number | null;
  notes: string;
  /** Ordered warmup sets, shown only for REPS exercises (a % needs a working weight). */
  warmups: EditorWarmup[];
}

const iconBtn =
  "flex size-11 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-30";

export function TemplateExerciseRow({
  exercise: e,
  index,
  count,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  exercise: EditorExercise;
  index: number;
  count: number;
  onChange: (next: EditorExercise) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const [showNotes, setShowNotes] = useState(e.notes.trim() !== "");
  const [volText, setVolText] = useState(String(e.targetVolumeKg));

  function set(patch: Partial<EditorExercise>) {
    onChange({ ...e, ...patch });
  }

  // Keep min ≤ max as either bound moves.
  function setRepMin(repMin: number) {
    set({ repMin, repMax: Math.max(repMin, e.repMax) });
  }
  function setRepMax(repMax: number) {
    set({ repMax, repMin: Math.min(repMax, e.repMin) });
  }

  function addWarmup() {
    set({
      warmups: [
        ...e.warmups,
        {
          rowId: crypto.randomUUID(),
          reps: 8,
          weightMode: "PERCENT",
          weightKg: 20,
          percentOfWorking: 50,
        },
      ],
    });
  }
  function updateWarmup(rowId: string, patch: Partial<EditorWarmup>) {
    set({
      warmups: e.warmups.map((w) =>
        w.rowId === rowId ? { ...w, ...patch } : w,
      ),
    });
  }
  function removeWarmup(rowId: string) {
    set({ warmups: e.warmups.filter((w) => w.rowId !== rowId) });
  }

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex items-center gap-1">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{e.exerciseName}</p>
          {e.muscleGroup && (
            <p className="text-muted-foreground truncate text-xs">
              {e.muscleGroup}
            </p>
          )}
        </div>
        <button
          type="button"
          aria-label={`Move ${e.exerciseName} up`}
          className={iconBtn}
          disabled={index === 0}
          onClick={onMoveUp}
        >
          <ChevronUp className="size-5" aria-hidden />
        </button>
        <button
          type="button"
          aria-label={`Move ${e.exerciseName} down`}
          className={iconBtn}
          disabled={index === count - 1}
          onClick={onMoveDown}
        >
          <ChevronDown className="size-5" aria-hidden />
        </button>
        <button
          type="button"
          aria-label={`Remove ${e.exerciseName}`}
          className={`${iconBtn} text-muted-foreground hover:text-destructive`}
          onClick={onRemove}
        >
          <Trash2 className="size-5" aria-hidden />
        </button>
      </div>

      <Segmented
        ariaLabel="Target type"
        value={e.targetType}
        onChange={(targetType) => set({ targetType })}
        options={[
          { value: "REPS", label: "Reps" },
          { value: "VOLUME", label: "Volume" },
        ]}
      />

      {e.targetType === "REPS" ? (
        <>
          <div className="space-y-2 rounded-md border border-dashed p-2.5">
            <div className="flex items-center justify-between">
              <Label>Warmup sets</Label>
              <span className="text-muted-foreground text-xs">
                Not counted in volume
              </span>
            </div>

            {e.warmups.length === 0 && (
              <p className="text-muted-foreground text-xs">
                Optional — warmups show first in the workout, before your working
                sets.
              </p>
            )}

            {e.warmups.map((w, wi) => (
              <div
                key={w.rowId}
                className="bg-muted/40 space-y-2.5 rounded-md p-2.5"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">Warmup {wi + 1}</span>
                  <button
                    type="button"
                    aria-label={`Remove warmup ${wi + 1}`}
                    onClick={() => removeWarmup(w.rowId)}
                    className="text-muted-foreground hover:text-destructive flex size-8 items-center justify-center rounded-md transition-colors"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor={`warmup-reps-${w.rowId}`}>Reps</Label>
                  <Stepper
                    id={`warmup-reps-${w.rowId}`}
                    label={`warmup ${wi + 1} reps`}
                    value={w.reps}
                    onChange={(reps) => updateWarmup(w.rowId, { reps })}
                    min={1}
                    max={100}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor={`warmup-weight-${w.rowId}`}>Weight</Label>
                  <Segmented
                    ariaLabel={`Warmup ${wi + 1} weight mode`}
                    value={w.weightMode}
                    onChange={(weightMode) =>
                      updateWarmup(w.rowId, { weightMode })
                    }
                    options={[
                      { value: "PERCENT", label: "% of working" },
                      { value: "ABSOLUTE", label: "kg" },
                    ]}
                  />
                  {w.weightMode === "PERCENT" ? (
                    <Stepper
                      id={`warmup-weight-${w.rowId}`}
                      label={`warmup ${wi + 1} percent of working weight`}
                      value={w.percentOfWorking}
                      onChange={(percentOfWorking) =>
                        updateWarmup(w.rowId, { percentOfWorking })
                      }
                      step={5}
                      min={1}
                      max={100}
                      inputMode="numeric"
                    />
                  ) : (
                    <Stepper
                      id={`warmup-weight-${w.rowId}`}
                      label={`warmup ${wi + 1} weight in kilograms`}
                      value={w.weightKg}
                      onChange={(weightKg) => updateWarmup(w.rowId, { weightKg })}
                      step={2.5}
                      min={2.5}
                      max={500}
                      inputMode="decimal"
                    />
                  )}
                </div>
              </div>
            ))}

            {e.warmups.length < 10 && (
              <button
                type="button"
                onClick={addWarmup}
                className="hover:bg-accent text-muted-foreground flex h-10 w-full items-center justify-center gap-1 rounded-md border border-dashed text-sm font-medium transition-colors"
              >
                <Plus className="size-4" aria-hidden />
                Add warmup set
              </button>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`sets-${e.rowId}`}>Sets</Label>
            <Stepper
              id={`sets-${e.rowId}`}
              label="target sets"
              value={e.targetSets}
              onChange={(targetSets) => set({ targetSets })}
              min={1}
              max={20}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Rep range</Label>
            <div className="flex items-center gap-2">
              <Stepper
                label="minimum reps"
                value={e.repMin}
                onChange={setRepMin}
                min={1}
                max={100}
                className="flex-1"
              />
              <span className="text-muted-foreground" aria-hidden>
                –
              </span>
              <Stepper
                label="maximum reps"
                value={e.repMax}
                onChange={setRepMax}
                min={1}
                max={100}
                className="flex-1"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor={`weight-${e.rowId}`}>Target weight (kg)</Label>
              <button
                type="button"
                onClick={() =>
                  set({ targetWeightKg: e.targetWeightKg === null ? 20 : null })
                }
                className="text-muted-foreground hover:text-foreground text-sm font-medium transition-colors"
              >
                {e.targetWeightKg === null ? "Add" : "Remove"}
              </button>
            </div>
            {e.targetWeightKg !== null && (
              <Stepper
                id={`weight-${e.rowId}`}
                label="target weight in kilograms"
                value={e.targetWeightKg}
                onChange={(targetWeightKg) => set({ targetWeightKg })}
                step={2.5}
                min={0}
                max={500}
                inputMode="decimal"
              />
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`increment-${e.rowId}`}>Weight increment (kg)</Label>
            <Stepper
              id={`increment-${e.rowId}`}
              label="weight increment in kilograms"
              value={e.weightIncrementKg}
              onChange={(weightIncrementKg) => set({ weightIncrementKg })}
              step={0.5}
              min={0.5}
              max={50}
              inputMode="decimal"
            />
          </div>
        </>
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor={`volume-${e.rowId}`}>Target volume (kg)</Label>
          <Input
            id={`volume-${e.rowId}`}
            inputMode="decimal"
            aria-label="target volume in kilograms"
            value={volText}
            onChange={(ev) => {
              const v = ev.target.value;
              setVolText(v);
              const n = Number(v);
              if (v !== "" && !Number.isNaN(n)) {
                set({ targetVolumeKg: Math.min(100000, Math.max(0, n)) });
              }
            }}
            onBlur={() => setVolText(String(e.targetVolumeKg))}
            className="h-11"
          />
        </div>
      )}

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor={`rest-${e.rowId}`}>Rest (sec)</Label>
          <button
            type="button"
            onClick={() => set({ restSec: e.restSec === null ? 90 : null })}
            className="text-muted-foreground hover:text-foreground text-sm font-medium transition-colors"
          >
            {e.restSec === null ? "Add" : "Remove"}
          </button>
        </div>
        {e.restSec !== null && (
          <Stepper
            id={`rest-${e.rowId}`}
            label="rest in seconds"
            value={e.restSec}
            onChange={(restSec) => set({ restSec })}
            step={15}
            min={0}
            max={3600}
          />
        )}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor={`notes-${e.rowId}`}>Notes</Label>
          <button
            type="button"
            onClick={() => {
              if (showNotes) set({ notes: "" });
              setShowNotes((s) => !s);
            }}
            className="text-muted-foreground hover:text-foreground text-sm font-medium transition-colors"
          >
            {showNotes ? "Remove" : "Add"}
          </button>
        </div>
        {showNotes && (
          <Input
            id={`notes-${e.rowId}`}
            value={e.notes}
            onChange={(ev) => set({ notes: ev.target.value })}
            placeholder="e.g. last set to failure"
            className="h-11"
          />
        )}
      </div>
    </div>
  );
}
