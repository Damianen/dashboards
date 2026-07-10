"use client";

import { Suspense, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { GoalSummaryCard } from "@/components/insights/goal-summary-card";
import { ObservationHistoryCard } from "@/components/insights/observation-history-card";
import { ObservationsCard } from "@/components/insights/observations-card";
import { WeeklyReviewCard } from "@/components/insights/weekly-review-card";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { WeekNav } from "@/components/ui/week-nav";
import { mondayOf } from "@/lib/aggregate";
import { todayLocal } from "@/lib/dates";

type InsightsView = "observations" | "weekly";

const SUBTITLES: Record<InsightsView, string> = {
  observations: "Cross-domain patterns — hypotheses to explore, not proof",
  weekly: "This week against last — independent metrics, never netted",
};

function InsightsHeader({ view }: { view: InsightsView }) {
  return (
    <header className="space-y-1">
      <h1 className="text-xl font-semibold">Insights</h1>
      <p className="text-muted-foreground text-sm">{SUBTITLES[view]}</p>
    </header>
  );
}

/** Inert lookalike served as the Suspense fallback (BriefingCard pattern). */
function InsightsPageFallback() {
  return (
    <div className="space-y-4" aria-hidden>
      <InsightsHeader view="observations" />
      <div className="bg-muted h-[52px] rounded-lg" />
      <Skeleton className="h-40 w-full rounded-xl" />
    </div>
  );
}

/**
 * The Insights page: a segmented switch between the observations feed and the
 * weekly review, driven by `?view=weekly` (the bottom nav is full, so the
 * weekly-summary push deep-links here). The wrapper Suspense exists because
 * the inner component reads useSearchParams (BriefingCard precedent).
 */
export function InsightsPage() {
  return (
    <Suspense fallback={<InsightsPageFallback />}>
      <InsightsPageInner />
    </Suspense>
  );
}

function InsightsPageInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // The URL is the source of truth for the segment: deep-linkable and
  // back-button friendly. Anything but "weekly" is the default view.
  const view: InsightsView =
    searchParams.get("view") === "weekly" ? "weekly" : "observations";
  // undefined = the current week resolved server-side (so the review follows a
  // day rollover); set only while browsing past weeks.
  const [weekStart, setWeekStart] = useState<string | undefined>(undefined);

  const currentWeek = mondayOf(todayLocal());

  function setView(next: InsightsView) {
    router.replace(next === "weekly" ? `${pathname}?view=weekly` : pathname, {
      scroll: false,
    });
  }

  return (
    <div className="space-y-4">
      <InsightsHeader view={view} />
      {/* Above the segment switch: visible in both views (the /goal entry point). */}
      <GoalSummaryCard />
      <Segmented<InsightsView>
        value={view}
        onChange={setView}
        options={[
          { value: "observations", label: "Observations" },
          { value: "weekly", label: "Weekly" },
        ]}
        ariaLabel="Insights view"
      />
      {view === "weekly" ? (
        <>
          <WeekNav
            weekStart={weekStart ?? currentWeek}
            onChange={(next) =>
              setWeekStart(next === currentWeek ? undefined : next)
            }
          />
          <WeeklyReviewCard weekStart={weekStart} />
        </>
      ) : (
        <>
          <ObservationsCard />
          <ObservationHistoryCard />
        </>
      )}
    </div>
  );
}
