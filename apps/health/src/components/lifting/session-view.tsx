"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, Plus } from "lucide-react";

import { AddSetSheet } from "@/components/lifting/add-set-sheet";
import { ExerciseGroupRow } from "@/components/lifting/exercise-group-row";
import { PlannedExerciseCard } from "@/components/lifting/planned-exercise-card";
import {
  SessionSetSheet,
  type SheetTarget,
} from "@/components/lifting/session-set-sheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber } from "@/lib/format";
import { useSession } from "@/lib/hooks/use-session";
import { useTemplate } from "@/lib/hooks/use-templates";
import { countPlanProgress } from "@/lib/session-progress";

function ViewSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-8 w-40 rounded-md" />
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-32 w-full rounded-xl" />
      ))}
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/lifting"
      className="text-muted-foreground hover:text-foreground -ml-1 inline-flex items-center gap-1 text-sm"
    >
      <ChevronLeft className="size-4" aria-hidden />
      Lifting
    </Link>
  );
}

export function SessionView({ id }: { id: string }) {
  const { data: session, isLoading, isError, refetch, isFetching } =
    useSession(id);
  // The plan snapshot froze targets, but the title just needs the current name.
  const { data: template } = useTemplate(session?.templateId ?? undefined);

  const [target, setTarget] = useState<SheetTarget | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <BackLink />
        <ViewSkeleton />
      </div>
    );
  }

  if (isError || !session) {
    return (
      <div className="space-y-4">
        <BackLink />
        <div className="space-y-3 py-8 text-center">
          <p className="text-muted-foreground text-sm">
            Couldn&apos;t load this session.
          </p>
          <Button
            variant="outline"
            onClick={() => void refetch()}
            disabled={isFetching}
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const title = session.templateId
    ? (template?.name ?? "Workout")
    : "Ad-hoc";
  const planned = session.exercises.filter((e) => e.plan);
  const extra = session.exercises.filter((e) => !e.plan);
  const { planned: plannedCount, completed } = countPlanProgress(
    session.exercises,
  );

  function openAddSet(t: SheetTarget) {
    setTarget(t);
    setSheetOpen(true);
  }

  return (
    <div className="space-y-4">
      <BackLink />

      <header className="space-y-1">
        <h1 className="text-xl font-semibold">{title}</h1>
        <div className="text-muted-foreground flex items-center gap-2 text-sm">
          <span className="tabular-nums">
            {formatNumber(session.volumeKg)} kg
          </span>
          {plannedCount > 0 && (
            <>
              <span aria-hidden>·</span>
              <span className="tabular-nums">
                {completed}/{plannedCount} exercises
              </span>
            </>
          )}
        </div>
      </header>

      {planned.length > 0 && (
        <div className="space-y-3">
          {planned.map((e) => (
            <PlannedExerciseCard
              key={e.exerciseId}
              exercise={e}
              onAddSet={openAddSet}
            />
          ))}
        </div>
      )}

      {extra.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-muted-foreground text-sm font-medium">Extra</h2>
          {extra.map(
            (e) =>
              e.sets && (
                <div key={e.exerciseId} className="rounded-xl border p-4">
                  <ExerciseGroupRow group={e.sets} />
                </div>
              ),
          )}
        </section>
      )}

      <Button
        variant="outline"
        className="h-12 w-full text-base"
        onClick={() => setPickerOpen(true)}
      >
        <Plus className="size-5" aria-hidden />
        Add set
      </Button>

      <SessionSetSheet
        open={sheetOpen}
        target={target}
        onOpenChange={setSheetOpen}
        day={session.day}
        sessionId={session.sessionId}
      />
      <AddSetSheet
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        day={session.day}
        sessionId={session.sessionId}
      />
    </div>
  );
}
