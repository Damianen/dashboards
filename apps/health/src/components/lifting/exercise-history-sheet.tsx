"use client";

import { BottomSheet } from "@/components/ui/bottom-sheet";
import { formatNumber } from "@/lib/format";
import { useExerciseHistory } from "@/lib/hooks/use-exercise-history";

/** The graph-icon sheet: recent sessions for this exercise, newest first. */
export function ExerciseHistorySheet({
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
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={exerciseName}
      description="Recent history"
      showTitle
      titleClassName="font-semibold"
      showDescription
      descriptionClassName="text-muted-foreground text-sm"
      contentClassName="max-h-[85dvh]"
      bodyClassName="overflow-y-auto"
    >
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
                    {formatNumber(Number(set.weightKg), 1)} kg × {set.reps}
                    {set.rpe != null
                      ? ` @ RPE ${formatNumber(Number(set.rpe), 1)}`
                      : ""}
                    {set.isWarmup ? " (W)" : ""}
                  </p>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </BottomSheet>
  );
}
