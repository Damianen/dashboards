"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Plus } from "lucide-react";
import { toast } from "sonner";
import { Drawer } from "vaul";

import { ExercisePicker } from "@/components/lifting/exercise-picker";
import {
  type EditorExercise,
  TemplateExerciseRow,
} from "@/components/lifting/template-exercise-row";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import type { Exercise } from "@/lib/hooks/use-exercises";
import {
  type SessionDTO,
  useLiftingSessions,
} from "@/lib/hooks/use-lifting-sessions";
import {
  type TemplateDTO,
  type TemplateExerciseDTO,
  TemplateSaveError,
  useCreateTemplate,
  useTemplate,
  useUpdateTemplate,
} from "@/lib/hooks/use-templates";
import type { CreateTemplateInput } from "@/lib/schemas/template";

/** Exercise ids ordered by how recently they were last logged (newest first). */
function recentExerciseIds(sessions: SessionDTO[] | undefined): string[] {
  const ids: string[] = [];
  for (const session of sessions ?? []) {
    for (const group of session.exercises) {
      if (!ids.includes(group.exerciseId)) ids.push(group.exerciseId);
    }
  }
  return ids;
}

function newRow(ex: Exercise): EditorExercise {
  return {
    rowId: crypto.randomUUID(),
    exerciseId: ex.id,
    exerciseName: ex.name,
    muscleGroup: ex.muscleGroup ?? null,
    targetType: "REPS",
    targetSets: 3,
    repMin: 8,
    repMax: 12,
    targetWeightKg: null,
    weightIncrementKg: 2.5,
    targetVolumeKg: 1000,
    restSec: null,
    notes: "",
    warmups: [],
  };
}

/** Seed an editor row from a saved template exercise. Its stored id is a stable key;
 *  each warmup keeps both weight values populated (defaulting the inactive one) so
 *  toggling kg↔% never loses data. */
function rowFromView(v: TemplateExerciseDTO): EditorExercise {
  return {
    rowId: v.id,
    exerciseId: v.exerciseId,
    exerciseName: v.exerciseName,
    muscleGroup: v.muscleGroup,
    targetType: v.targetType,
    targetSets: v.targetSets ?? 3,
    repMin: v.repMin ?? 8,
    repMax: v.repMax ?? 12,
    targetWeightKg: v.targetWeightKg,
    weightIncrementKg: v.weightIncrementKg ?? 2.5,
    targetVolumeKg: v.targetVolumeKg ?? 1000,
    restSec: v.restSec,
    notes: v.notes ?? "",
    warmups: v.warmups.map((w) => ({
      rowId: crypto.randomUUID(),
      reps: w.reps,
      weightMode: w.weightMode,
      weightKg: w.weightKg ?? 20,
      percentOfWorking: w.percentOfWorking ?? 50,
    })),
  };
}

/** Map an editor row to the discriminated API input, dropping unset optionals. */
function toInput(e: EditorExercise): CreateTemplateInput["exercises"][number] {
  const restSec = e.restSec === null ? undefined : e.restSec;
  const notes = e.notes.trim() === "" ? undefined : e.notes.trim();
  if (e.targetType === "REPS") {
    return {
      exerciseId: e.exerciseId,
      targetType: "REPS",
      targetSets: e.targetSets,
      repMin: e.repMin,
      repMax: e.repMax,
      targetWeightKg: e.targetWeightKg === null ? undefined : e.targetWeightKg,
      weightIncrementKg: e.weightIncrementKg,
      restSec,
      notes,
      warmups: e.warmups.map((w) =>
        w.weightMode === "ABSOLUTE"
          ? { weightMode: "ABSOLUTE" as const, reps: w.reps, weightKg: w.weightKg }
          : {
              weightMode: "PERCENT" as const,
              reps: w.reps,
              percentOfWorking: w.percentOfWorking,
            },
      ),
    };
  }
  // VOLUME exercises never carry warmups (no working weight to anchor a %).
  return {
    exerciseId: e.exerciseId,
    targetType: "VOLUME",
    targetVolumeKg: e.targetVolumeKg,
    restSec,
    notes,
    warmups: [],
  };
}

/** Collect the non-name save errors for the top banner (flatten() loses the
 *  per-exercise index, so those surface here; client guards make them rare). */
function bannerErrors(error: unknown): string[] {
  if (error instanceof TemplateSaveError) {
    const out: string[] = [];
    if (error.formErrors?.length) out.push(...error.formErrors);
    if (error.fieldErrors?.exercises?.length)
      out.push(...error.fieldErrors.exercises);
    if (error.fieldErrors?.notes?.length) out.push(...error.fieldErrors.notes);
    if (!error.fieldErrors && !error.formErrors) out.push(error.message);
    return out;
  }
  if (error) return ["Couldn't save template"];
  return [];
}

export function TemplateEditor({ templateId }: { templateId?: string }) {
  const router = useRouter();
  const isEdit = !!templateId;

  const detail = useTemplate(templateId);
  const create = useCreateTemplate();
  const update = useUpdateTemplate(templateId ?? "");

  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<EditorExercise[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [seeded, setSeeded] = useState(false);

  const { data: sessions } = useLiftingSessions();
  const recentIds = useMemo(() => recentExerciseIds(sessions), [sessions]);

  // Seed once from the loaded template (render-time pattern, as in set-form).
  if (isEdit && !seeded && detail.data) {
    const t: TemplateDTO = detail.data;
    setSeeded(true);
    setName(t.name);
    setNotes(t.notes ?? "");
    setRows(t.exercises.map(rowFromView));
  }

  const saving = create.isPending || update.isPending;
  const saveError = create.error ?? update.error;
  const nameError =
    saveError instanceof TemplateSaveError
      ? saveError.fieldErrors?.name?.[0]
      : undefined;
  const banner = bannerErrors(saveError);

  function updateRow(index: number, next: EditorExercise) {
    setRows((r) => r.map((row, i) => (i === index ? next : row)));
  }
  function removeRow(index: number) {
    setRows((r) => r.filter((_, i) => i !== index));
  }
  function move(index: number, dir: -1 | 1) {
    setRows((r) => {
      const j = index + dir;
      if (j < 0 || j >= r.length) return r;
      const copy = [...r];
      [copy[index], copy[j]] = [copy[j]!, copy[index]!];
      return copy;
    });
  }
  function addExercise(ex: Exercise) {
    setRows((r) => [...r, newRow(ex)]);
    setPickerOpen(false);
  }

  function save() {
    const payload: CreateTemplateInput = {
      name: name.trim(),
      notes: notes.trim() === "" ? undefined : notes.trim(),
      exercises: rows.map(toInput),
    };
    const mutation = isEdit ? update : create;
    mutation.mutate(payload, {
      onSuccess: () => {
        toast.success(isEdit ? "Template updated" : "Template created");
        router.push("/lifting");
      },
    });
  }

  const canSave = !saving && name.trim() !== "" && rows.length > 0;

  return (
    <div className="space-y-4">
      <header className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => router.push("/lifting")}
          aria-label="Back to lifting"
          className="hover:bg-accent flex size-9 items-center justify-center rounded-md transition-colors"
        >
          <ChevronLeft className="size-5" aria-hidden />
        </button>
        <h1 className="text-xl font-semibold">
          {isEdit ? "Edit template" : "New template"}
        </h1>
      </header>

      {isEdit && detail.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-lg" />
          ))}
        </div>
      ) : isEdit && detail.isError ? (
        <div className="space-y-3 py-8 text-center">
          <p className="text-muted-foreground text-sm">
            Couldn&apos;t load this template.
          </p>
          <Button
            variant="outline"
            onClick={() => void detail.refetch()}
            disabled={detail.isFetching}
          >
            Retry
          </Button>
        </div>
      ) : (
        <>
          {banner.length > 0 && (
            <div
              role="alert"
              className="border-destructive/50 bg-destructive/10 text-destructive space-y-1 rounded-md border p-3 text-sm"
            >
              {banner.map((msg, i) => (
                <p key={i}>{msg}</p>
              ))}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="tpl-name">Name</Label>
            <Input
              id="tpl-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Push A"
              aria-invalid={!!nameError}
              className="h-11"
            />
            {nameError && <p className="text-destructive text-sm">{nameError}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tpl-notes">Notes</Label>
            <Input
              id="tpl-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="optional"
              className="h-11"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Exercises</h2>
              <span className="text-muted-foreground text-sm">
                {rows.length}
              </span>
            </div>

            {rows.length === 0 && (
              <p className="text-muted-foreground text-sm">
                No exercises yet — add one to get started.
              </p>
            )}

            {rows.map((row, i) => (
              <TemplateExerciseRow
                key={row.rowId}
                exercise={row}
                index={i}
                count={rows.length}
                onChange={(next) => updateRow(i, next)}
                onRemove={() => removeRow(i)}
                onMoveUp={() => move(i, -1)}
                onMoveDown={() => move(i, 1)}
              />
            ))}

            <Button
              type="button"
              variant="outline"
              className="h-11 w-full border-dashed"
              onClick={() => setPickerOpen(true)}
            >
              <Plus className="size-5" aria-hidden />
              Add exercise
            </Button>
          </div>

          <Button
            type="button"
            className="h-12 w-full text-base"
            onClick={save}
            disabled={!canSave}
          >
            {isEdit ? "Save changes" : "Create template"}
          </Button>
        </>
      )}

      <Drawer.Root open={pickerOpen} onOpenChange={setPickerOpen}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-50 bg-black/60" />
          <Drawer.Content
            className="bg-card fixed inset-x-0 bottom-0 z-50 mt-24 flex max-h-[90dvh] flex-col rounded-t-2xl border-t outline-none"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            <div className="bg-muted mx-auto mt-3 h-1.5 w-10 shrink-0 rounded-full" />
            <div className="mx-auto w-full max-w-md p-4">
              <Drawer.Title className="sr-only">Add an exercise</Drawer.Title>
              <Drawer.Description className="sr-only">
                Search and pick an exercise to add to this template.
              </Drawer.Description>
              <ExercisePicker
                title="Add exercise"
                recentIds={recentIds}
                onPick={addExercise}
              />
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </div>
  );
}
