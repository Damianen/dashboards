"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, ChevronLeft, Plus, Timer } from "lucide-react";

import { AddSetSheet } from "@/components/lifting/add-set-sheet";
import { ExerciseSetTable } from "@/components/lifting/exercise-set-table";
import { SessionMenu } from "@/components/lifting/session-menu";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { dateLabel, timeLabel } from "@/lib/format";
import { useFinishSession } from "@/lib/hooks/use-finish-session";
import { useSession } from "@/lib/hooks/use-session";
import { useTemplate } from "@/lib/hooks/use-templates";

function ViewSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-8 w-40 rounded-md" />
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-40 w-full rounded-xl" />
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

/** A live elapsed-time clock since the session started (h:mm:ss, or m:ss < 1h). */
function ElapsedTimer({ startedAt }: { startedAt: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const sec = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const label =
    h > 0
      ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
      : `${m}:${String(s).padStart(2, "0")}`;
  return (
    <span className="text-muted-foreground flex items-center gap-1.5 text-sm tabular-nums">
      <Timer className="size-4" aria-hidden />
      {label}
    </span>
  );
}

export function SessionView({ id }: { id: string }) {
  const { data: session, isLoading, isError, refetch, isFetching } =
    useSession(id);
  // The plan snapshot froze targets, but the title just needs the current name.
  const { data: template } = useTemplate(session?.templateId ?? undefined);
  const { finish } = useFinishSession(id, session?.day ?? "");

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

  const baseTitle = session.templateId
    ? (template?.name ?? "Workout")
    : "Ad-hoc";
  const title =
    session.templateOrdinal != null
      ? `${baseTitle} #${session.templateOrdinal}`
      : baseTitle;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        {session.endedAt == null ? (
          <ElapsedTimer startedAt={session.startedAt} />
        ) : (
          <span className="text-muted-foreground flex items-center gap-1.5 text-sm">
            <CheckCircle2 className="size-4" aria-hidden />
            Finished {timeLabel(session.endedAt)}
          </span>
        )}
        <div className="flex items-center gap-1">
          {session.endedAt == null && (
            <Button
              onClick={() => finish.mutate()}
              disabled={finish.isPending}
              className="bg-success text-success-foreground hover:bg-success/90 h-9 px-5"
            >
              Finish
            </Button>
          )}
          <SessionMenu session={session} />
        </div>
      </div>

      <header className="space-y-0.5">
        <BackLink />
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="text-muted-foreground text-sm">{dateLabel(session.day)}</p>
      </header>

      <div className="space-y-3">
        {session.exercises.map((e) => (
          <ExerciseSetTable
            key={e.exerciseId}
            exercise={e}
            day={session.day}
            sessionId={session.sessionId}
          />
        ))}
      </div>

      <Button
        variant="outline"
        className="h-12 w-full text-base"
        onClick={() => setPickerOpen(true)}
      >
        <Plus className="size-5" aria-hidden />
        Add exercise
      </Button>

      <AddSetSheet
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        day={session.day}
        sessionId={session.sessionId}
      />
    </div>
  );
}
