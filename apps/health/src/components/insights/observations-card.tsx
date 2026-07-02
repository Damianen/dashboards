"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { useInView } from "@/lib/hooks/use-in-view";
import { useObservations } from "@/lib/hooks/use-observations";
import type { Observation } from "@/lib/observations";

// 14 is the smallest useful window: detectors need MIN_PAIRED_DAYS (8) pairs
// and lag by a day, so a 7-day option could never produce an observation.
const WINDOWS = ["14", "30", "90"] as const;
type WindowChoice = (typeof WINDOWS)[number];

function strengthLabel(strength: number): string {
  const a = Math.abs(strength);
  if (a >= 0.6) return "Strong";
  if (a >= 0.4) return "Moderate";
  return "Weak";
}

function directionLabel(direction: Observation["direction"]): string {
  if (direction === "positive") return "positive";
  if (direction === "negative") return "negative";
  return "no clear";
}

/**
 * The observations list — cross-domain correlational HYPOTHESES, each shown with its
 * sample size and a standing "hypothesis, not proof" caveat. Below-n observations never
 * reach here (the service drops them). Self-contained + lazy: fetches once on first scroll
 * into view.
 */
export function ObservationsCard() {
  const [ref, inView] = useInView<HTMLDivElement>();
  const [window, setWindow] = useState<WindowChoice>("30");
  const { data, isLoading, isError } = useObservations(Number(window), inView);

  const loading = !inView || isLoading;
  const observations = data?.observations ?? [];

  return (
    <Card ref={ref} className="gap-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-0.5">
          <h2 className="text-sm leading-tight font-semibold">Observations</h2>
          <p className="text-muted-foreground text-xs">
            Patterns across your data over the last{" "}
            {data?.windowDays ?? Number(window)} days
          </p>
        </div>
        <Segmented<WindowChoice>
          value={window}
          onChange={setWindow}
          size="sm"
          ariaLabel="Observation window"
          className="w-36 shrink-0"
          options={WINDOWS.map((w) => ({ value: w, label: `${w}d` }))}
        />
      </div>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : isError ? (
        <p className="text-muted-foreground py-4 text-sm">
          Couldn&apos;t load observations.
        </p>
      ) : observations.length === 0 ? (
        <p className="text-muted-foreground py-4 text-sm">
          Nothing stands out yet — keep logging and patterns will appear here as the data
          builds up.
        </p>
      ) : (
        <ul className="space-y-2">
          {observations.map((o) => (
            <ObservationRow key={o.id} observation={o} />
          ))}
        </ul>
      )}

      <p className="text-muted-foreground border-t pt-3 text-xs">
        Hypotheses, not proof — correlational patterns shown with their sample size (n),
        never causal claims, and never used to set a target.
      </p>
    </Card>
  );
}

function ObservationRow({ observation }: { observation: Observation }) {
  return (
    <li className="rounded-lg border p-3">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-medium">{observation.title}</h3>
        <Badge variant="secondary" className="shrink-0 tabular-nums">
          n={observation.n}
        </Badge>
      </div>
      <p className="text-muted-foreground mt-1 text-xs">{observation.finding}</p>
      <p className="text-muted-foreground mt-1 text-[11px]">
        {strengthLabel(observation.strength)} ·{" "}
        {directionLabel(observation.direction)} correlation
      </p>
    </li>
  );
}
