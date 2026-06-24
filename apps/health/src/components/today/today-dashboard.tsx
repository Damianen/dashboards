"use client";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ActivityCard,
  CaffeineCard,
  IntakeCard,
  LiftingCard,
  ProteinCard,
  SleepCard,
  StreaksCard,
  WaterCard,
  WeightCard,
} from "@/components/today/cards";
import { todayLocal } from "@/lib/dates";
import { useAdherence } from "@/lib/hooks/use-adherence";
import { useSummary } from "@/lib/hooks/use-summary";

function dateLabel(day: string): string {
  return new Date(`${day}T00:00:00`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 7 }).map((_, i) => (
        <Skeleton key={i} className="h-24 w-full rounded-xl" />
      ))}
    </div>
  );
}

export function TodayDashboard() {
  const day = todayLocal();
  const { data, isLoading, isError, refetch, isFetching } = useSummary(day);
  const { data: adherence } = useAdherence(day);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold">Today</h1>
        <p className="text-muted-foreground text-sm">{dateLabel(day)}</p>
      </header>

      {isLoading ? (
        <DashboardSkeleton />
      ) : isError ? (
        <div className="space-y-3 py-8 text-center">
          <p className="text-muted-foreground text-sm">
            Couldn&apos;t load today&apos;s summary.
          </p>
          <Button
            variant="outline"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            Retry
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <WaterCard s={data ?? null} />
          <CaffeineCard s={data ?? null} />
          <SleepCard s={data ?? null} />
          <WeightCard s={data ?? null} />
          <IntakeCard s={data ?? null} />
          <ProteinCard a={adherence ?? null} />
          <ActivityCard s={data ?? null} />
          <LiftingCard s={data ?? null} />
          <StreaksCard a={adherence ?? null} />
        </div>
      )}
    </div>
  );
}
