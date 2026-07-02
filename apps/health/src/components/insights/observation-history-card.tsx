"use client";

import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { dateLabel } from "@/lib/format";
import { useInView } from "@/lib/hooks/use-in-view";
import { useObservationHistory } from "@/lib/hooks/use-observation-history";

/**
 * Past push-notified observations, newest first — the trail of "new
 * observation" pushes, so a dismissed notification is never lost. Lazy like
 * ObservationsCard: fetches once on first scroll into view.
 */
export function ObservationHistoryCard() {
  const [ref, inView] = useInView<HTMLDivElement>();
  const { data, isLoading, isError } = useObservationHistory(20, inView);

  const loading = !inView || isLoading;
  const items = data ?? [];

  return (
    <Card ref={ref} className="gap-3 p-4">
      <div className="space-y-0.5">
        <h2 className="text-sm leading-tight font-semibold">
          Notified observations
        </h2>
        <p className="text-muted-foreground text-xs">
          Every observation that reached you as a push, newest first
        </p>
      </div>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : isError ? (
        <p className="text-muted-foreground py-4 text-sm">
          Couldn&apos;t load the history.
        </p>
      ) : items.length === 0 ? (
        <p className="text-muted-foreground py-4 text-sm">
          No notified observations yet — noteworthy patterns are pushed at most
          once a day and will be listed here.
        </p>
      ) : (
        <ul className="divide-y">
          {items.map((o) => (
            <li
              key={o.observationId}
              className="flex items-baseline justify-between gap-3 py-2 first:pt-0 last:pb-0"
            >
              <span className="text-sm font-medium">{o.title}</span>
              <span className="text-muted-foreground shrink-0 text-xs">
                {dateLabel(o.day)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
