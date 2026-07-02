"use client";

import { useRouter } from "next/navigation";
import { Dumbbell, HelpCircle, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { Drawer } from "vaul";

import { Button } from "@/components/ui/button";
import { todayLocal } from "@/lib/dates";
import { formatLastPerformed } from "@/lib/format";
import {
  type TemplateDTO,
  type TemplateExerciseDTO,
  useStartFromTemplate,
} from "@/lib/hooks/use-templates";
import { formatWarmupDef } from "@/lib/warmup";

/** "{targetSets} × {name}" for a REPS exercise (the set count is the headline),
 *  else just the name (VOLUME items have no set count). */
function exerciseTitle(e: TemplateExerciseDTO): string {
  if (e.targetType === "REPS" && e.targetSets != null) {
    return `${e.targetSets} × ${e.exerciseName}`;
  }
  return e.exerciseName;
}

/** "Warmups: 8 × 50%, 8 × 40 kg" for an exercise that defines warmups, else null. */
function warmupRecap(e: TemplateExerciseDTO): string | null {
  if (e.warmups.length === 0) return null;
  return `Warmups: ${e.warmups.map(formatWarmupDef).join(", ")}`;
}

/** A one-line target recap surfaced by the "?" button. */
function exerciseInfo(e: TemplateExerciseDTO): string {
  if (e.targetType === "REPS") {
    const parts = [
      e.targetSets != null ? `${e.targetSets} sets` : "",
      e.repMin != null && e.repMax != null ? `${e.repMin}–${e.repMax} reps` : "",
      e.targetWeightKg != null ? `${e.targetWeightKg} kg` : "",
      e.weightIncrementKg != null ? `+${e.weightIncrementKg} kg/session` : "",
      warmupRecap(e) ?? "",
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(" · ") : "No target set";
  }
  return e.targetVolumeKg != null
    ? `${e.targetVolumeKg} kg volume`
    : "Volume target";
}

/**
 * A bottom-sheet preview of a template: header (close / name / Edit), a
 * "Last Performed" subline, the scrollable exercise list (thumbnail, set count ×
 * name, muscle group, a "?" info button), and a sticky "Start Workout" button.
 * The template detail is passed in from the card — no extra fetch.
 */
export function TemplatePreviewSheet({
  template,
  open,
  onOpenChange,
  onEdit,
}: {
  template: TemplateDTO;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: () => void;
}) {
  const router = useRouter();
  const start = useStartFromTemplate();

  function startWorkout() {
    onOpenChange(false);
    start.mutate(template.id, {
      onSuccess: (session) =>
        router.push(`/lifting/sessions/${session.sessionId}`),
    });
  }

  return (
    // Deliberately raw vaul (not ui/bottom-sheet): Title/Description are part of
    // the custom header row + subline layout here, and BottomSheet's a11y
    // guarantee owns their placement.
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <Drawer.Content
          className="bg-card fixed inset-x-0 bottom-0 z-50 mt-24 flex max-h-[90dvh] flex-col rounded-t-2xl border-t outline-none"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <div className="bg-muted mx-auto mt-3 h-1.5 w-10 shrink-0 rounded-full" />
          <div className="mx-auto flex w-full max-w-md flex-1 flex-col overflow-hidden">
            <div className="flex items-center justify-between gap-2 px-3 py-2">
              <button
                type="button"
                aria-label="Close"
                onClick={() => onOpenChange(false)}
                className="hover:bg-accent flex size-9 items-center justify-center rounded-md transition-colors"
              >
                <X className="size-5" aria-hidden />
              </button>
              <Drawer.Title className="min-w-0 flex-1 truncate text-center font-semibold">
                {template.name}
              </Drawer.Title>
              <button
                type="button"
                onClick={onEdit}
                className="hover:bg-accent flex h-9 items-center gap-1 rounded-md px-2 text-sm font-medium transition-colors"
              >
                <Pencil className="size-4" aria-hidden />
                Edit
              </button>
            </div>
            <Drawer.Description className="text-muted-foreground px-4 pb-2 text-sm">
              Last Performed:{" "}
              {formatLastPerformed(template.lastPerformedDay, todayLocal())}
            </Drawer.Description>

            <div className="flex-1 space-y-0.5 overflow-y-auto px-2 py-2">
              {template.exercises.map((e) => (
                <div
                  key={e.id}
                  className="flex items-center gap-3 rounded-lg px-2 py-2"
                >
                  <div className="bg-muted text-muted-foreground flex size-11 shrink-0 items-center justify-center rounded-lg">
                    <Dumbbell className="size-5" aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{exerciseTitle(e)}</p>
                    {e.muscleGroup && (
                      <p className="text-muted-foreground truncate text-sm">
                        {e.muscleGroup}
                      </p>
                    )}
                    {warmupRecap(e) && (
                      <p className="text-muted-foreground truncate text-xs">
                        {warmupRecap(e)}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    aria-label={`Info for ${e.exerciseName}`}
                    onClick={() =>
                      toast(e.exerciseName, { description: exerciseInfo(e) })
                    }
                    className="hover:bg-accent text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-full transition-colors"
                  >
                    <HelpCircle className="size-5" aria-hidden />
                  </button>
                </div>
              ))}
            </div>

            <div className="border-t px-4 pt-3 pb-2">
              <Button
                className="h-12 w-full text-base"
                onClick={startWorkout}
                disabled={start.isPending || template.archived}
              >
                {template.archived ? "Archived template" : "Start Workout"}
              </Button>
            </div>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
