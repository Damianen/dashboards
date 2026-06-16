"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { useExerciseHistory } from "@/lib/hooks/use-exercise-history";
import { summarizeLastTime } from "@/lib/lifting-grouping";

/** One-line recap of the most recent session for an exercise, shown above the set
 *  form. A never-logged exercise 404s (isError) → "First time". */
export function LastTime({ exercise }: { exercise: string }) {
  const { data, isLoading, isError } = useExerciseHistory(exercise, 1);

  if (isLoading) return <Skeleton className="h-4 w-40" />;

  const last = data?.[0];
  const summary = last
    ? summarizeLastTime(
        last.sets.map((s) => ({
          reps: s.reps,
          weightKg: Number(s.weightKg),
          isWarmup: s.isWarmup,
        })),
      )
    : null;

  if (isError || summary == null) {
    return <p className="text-muted-foreground text-sm">First time</p>;
  }
  return (
    <p className="text-muted-foreground text-sm">
      Last time: <span className="text-foreground">{summary}</span>
    </p>
  );
}
