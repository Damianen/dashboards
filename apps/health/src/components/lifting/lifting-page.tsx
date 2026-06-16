"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import { AddSetSheet } from "@/components/lifting/add-set-sheet";
import { RecentSessions } from "@/components/lifting/recent-sessions";
import { TodaySessions } from "@/components/lifting/today-sessions";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { todayLocal } from "@/lib/dates";
import { useLiftingSessions } from "@/lib/hooks/use-lifting-sessions";

function dateLabel(day: string): string {
  return new Date(`${day}T00:00:00`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function PageSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-28 w-full rounded-xl" />
      ))}
    </div>
  );
}

export function LiftingPage() {
  const day = todayLocal();
  const [sheetOpen, setSheetOpen] = useState(false);

  const today = useLiftingSessions(day);
  const recent = useLiftingSessions();

  const isLoading = today.isLoading || recent.isLoading;
  const isError = today.isError || recent.isError;
  // The recent list includes today's sessions — keep only older ones here.
  const recentOlder = (recent.data ?? []).filter((s) => s.day !== day);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold">Lifting</h1>
        <p className="text-muted-foreground text-sm">{dateLabel(day)}</p>
      </header>

      <Button
        className="h-12 w-full text-base"
        onClick={() => setSheetOpen(true)}
      >
        <Plus className="size-5" aria-hidden />
        Add set
      </Button>

      {isLoading ? (
        <PageSkeleton />
      ) : isError ? (
        <div className="space-y-3 py-8 text-center">
          <p className="text-muted-foreground text-sm">
            Couldn&apos;t load your sessions.
          </p>
          <Button
            variant="outline"
            onClick={() => {
              void today.refetch();
              void recent.refetch();
            }}
            disabled={today.isFetching || recent.isFetching}
          >
            Retry
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          <TodaySessions sessions={today.data ?? []} />
          <RecentSessions sessions={recentOlder} />
        </div>
      )}

      <AddSetSheet open={sheetOpen} onOpenChange={setSheetOpen} day={day} />
    </div>
  );
}
