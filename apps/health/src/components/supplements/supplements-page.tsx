"use client";

import Link from "next/link";
import { SlidersHorizontal } from "lucide-react";

import { SupplementGroupSection } from "@/components/supplements/supplement-group-section";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { todayLocal } from "@/lib/dates";
import { dateLabel } from "@/lib/format";
import { useChecklist } from "@/lib/hooks/use-supplements";

export function SupplementsPage() {
  const day = todayLocal();
  const { data, isLoading, isError, refetch, isFetching } = useChecklist(day);

  const isEmpty = data != null && data.every((g) => g.total === 0);

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Supplements</h1>
          <p className="text-muted-foreground text-sm">{dateLabel(day)}</p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link href="/supplements/manage">
            <SlidersHorizontal className="size-4" aria-hidden />
            Manage
          </Link>
        </Button>
      </header>

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <div className="space-y-3 py-8 text-center">
          <p className="text-muted-foreground text-sm">
            Couldn&apos;t load the checklist.
          </p>
          <Button
            variant="outline"
            onClick={() => void refetch()}
            disabled={isFetching}
          >
            Retry
          </Button>
        </div>
      ) : isEmpty ? (
        <div className="space-y-3 py-8 text-center">
          <p className="text-muted-foreground text-sm">
            No supplements yet. Add the ones you take to build your daily
            checklist.
          </p>
          <Button asChild variant="outline">
            <Link href="/supplements/manage">Add supplements</Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-5">
          {data?.map((group) => (
            <SupplementGroupSection
              key={group.timeGroup}
              day={day}
              group={group}
            />
          ))}
        </div>
      )}
    </div>
  );
}
