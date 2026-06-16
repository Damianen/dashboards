"use client";

import { useMemo, useState } from "react";
import { Drawer } from "vaul";

import { ExercisePicker } from "@/components/lifting/exercise-picker";
import { SetForm } from "@/components/lifting/set-form";
import type { Exercise } from "@/lib/hooks/use-exercises";
import {
  type SessionDTO,
  useLiftingSessions,
} from "@/lib/hooks/use-lifting-sessions";

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

/**
 * The "Add set" bottom sheet: pick an exercise, then log set after set. The sheet
 * deliberately stays open after each submit (the form keeps its values) so
 * repeats are one tap. Closing it resets back to the picker.
 */
export function AddSetSheet({
  open,
  onOpenChange,
  day,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  day: string;
}) {
  const [picked, setPicked] = useState<Exercise | null>(null);
  const { data: sessions } = useLiftingSessions();
  const recentIds = useMemo(() => recentExerciseIds(sessions), [sessions]);

  function handleOpenChange(next: boolean) {
    if (!next) setPicked(null);
    onOpenChange(next);
  }

  return (
    <Drawer.Root open={open} onOpenChange={handleOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <Drawer.Content
          className="bg-card fixed inset-x-0 bottom-0 z-50 mt-24 flex max-h-[90dvh] flex-col rounded-t-2xl border-t outline-none"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <div className="bg-muted mx-auto mt-3 h-1.5 w-10 shrink-0 rounded-full" />
          <div className="mx-auto w-full max-w-md p-4">
            <Drawer.Title className="sr-only">Add a set</Drawer.Title>
            <Drawer.Description className="sr-only">
              Pick an exercise and log your sets.
            </Drawer.Description>
            {picked === null ? (
              <ExercisePicker recentIds={recentIds} onPick={setPicked} />
            ) : (
              <SetForm
                key={picked.id}
                exercise={picked}
                day={day}
                onBack={() => setPicked(null)}
              />
            )}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
