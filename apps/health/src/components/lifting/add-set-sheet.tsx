"use client";

import { useState } from "react";

import { ExercisePicker } from "@/components/lifting/exercise-picker";
import { SetForm } from "@/components/lifting/set-form";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import type { Exercise } from "@/lib/hooks/use-exercises";
import { useRecentExerciseIds } from "@/lib/hooks/use-recent-exercise-ids";

/**
 * The "Add set" bottom sheet: pick an exercise, then log set after set. The sheet
 * deliberately stays open after each submit (the form keeps its values) so
 * repeats are one tap. Closing it resets back to the picker.
 */
export function AddSetSheet({
  open,
  onOpenChange,
  day,
  sessionId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  day: string;
  sessionId?: string;
}) {
  const [picked, setPicked] = useState<Exercise | null>(null);
  const recentIds = useRecentExerciseIds();

  function handleOpenChange(next: boolean) {
    if (!next) setPicked(null);
    onOpenChange(next);
  }

  return (
    <BottomSheet
      open={open}
      onOpenChange={handleOpenChange}
      title="Add a set"
      description="Pick an exercise and log your sets."
    >
      {picked === null ? (
        <ExercisePicker recentIds={recentIds} onPick={setPicked} />
      ) : (
        <SetForm
          key={picked.id}
          exercise={picked}
          day={day}
          sessionId={sessionId}
          onBack={() => setPicked(null)}
        />
      )}
    </BottomSheet>
  );
}
