"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { type Exercise, useExercises } from "@/lib/hooks/use-exercises";

/**
 * Searchable exercise list. With no query, recently-used exercises lead (in the
 * order given by `recentIds`), then the rest alphabetically; a query filters by
 * name while keeping the same ranking.
 */
export function ExercisePicker({
  recentIds,
  onPick,
  title = "Add a set",
}: {
  recentIds: string[];
  onPick: (exercise: Exercise) => void;
  title?: string;
}) {
  const { data, isLoading, isError } = useExercises();
  const [query, setQuery] = useState("");

  const ranked = useMemo(() => {
    const all = data ?? [];
    const q = query.trim().toLowerCase();
    const matches = q
      ? all.filter((e) => e.name.toLowerCase().includes(q))
      : all;
    const rank = (e: Exercise) => {
      const i = recentIds.indexOf(e.id);
      return i === -1 ? Number.MAX_SAFE_INTEGER : i;
    };
    return [...matches].sort((a, b) => {
      const ra = rank(a);
      const rb = rank(b);
      return ra !== rb ? ra - rb : a.name.localeCompare(b.name);
    });
  }, [data, query, recentIds]);

  return (
    <div className="space-y-3">
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="relative">
        <Search
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
          aria-hidden
        />
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search exercises"
          aria-label="Search exercises"
          className="h-11 pl-9"
        />
      </div>

      <div className="max-h-[55dvh] space-y-1 overflow-y-auto">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-md" />
          ))
        ) : isError ? (
          <p className="text-muted-foreground py-6 text-center text-sm">
            Couldn&apos;t load exercises.
          </p>
        ) : ranked.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">
            No exercises match.
          </p>
        ) : (
          ranked.map((exercise) => {
            const isRecent = recentIds.includes(exercise.id);
            return (
              <button
                key={exercise.id}
                type="button"
                onClick={() => onPick(exercise)}
                className="hover:bg-accent flex min-h-11 w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left transition-colors"
              >
                <span className="font-medium">{exercise.name}</span>
                <span className="text-muted-foreground text-xs">
                  {exercise.muscleGroup ??
                    (isRecent && query === "" ? "recent" : "")}
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
