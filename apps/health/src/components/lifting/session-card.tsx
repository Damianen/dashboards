"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { ExerciseGroupRow } from "@/components/lifting/exercise-group-row";
import { Card } from "@/components/ui/card";
import { dayLabelShort, formatNumber, timeLabel } from "@/lib/format";
import type { SessionDTO } from "@/lib/hooks/use-lifting-sessions";
import { cn } from "@/lib/utils";

/** A session as a collapsible card: header (day, top exercises, volume) that
 *  expands to the full set list grouped by exercise. */
export function SessionCard({
  session,
  defaultExpanded = false,
}: {
  session: SessionDTO;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const topExercises = session.exercises
    .map((e) => e.exerciseName)
    .slice(0, 3)
    .join(", ");

  return (
    <Card className="gap-0 p-4">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <div className="min-w-0">
          <div className="font-medium">
            {dayLabelShort(session.day)}, {timeLabel(session.startedAt)}
          </div>
          <div className="text-muted-foreground truncate text-xs">
            {topExercises || "No sets"}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-right">
            <div className="text-lg font-semibold tabular-nums">
              {formatNumber(session.volumeKg)} kg
            </div>
            <div className="text-muted-foreground text-xs">
              {session.workingSets} sets
            </div>
          </div>
          <ChevronDown
            className={cn(
              "text-muted-foreground size-4 shrink-0 transition-transform",
              expanded && "rotate-180",
            )}
            aria-hidden
          />
        </div>
      </button>

      {expanded && session.exercises.length > 0 && (
        <div className="mt-4 space-y-4">
          {session.exercises.map((group) => (
            <ExerciseGroupRow key={group.exerciseId} group={group} />
          ))}
        </div>
      )}
    </Card>
  );
}
