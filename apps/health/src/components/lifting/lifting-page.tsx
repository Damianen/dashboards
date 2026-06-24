"use client";

import { useState } from "react";
import { Plus, Search } from "lucide-react";

import { AddSetSheet } from "@/components/lifting/add-set-sheet";
import { RecentSessions } from "@/components/lifting/recent-sessions";
import { TemplatesSection } from "@/components/lifting/templates-section";
import { TodaySessions } from "@/components/lifting/today-sessions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { todayLocal } from "@/lib/dates";
import { useLiftingSessions } from "@/lib/hooks/use-lifting-sessions";

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
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");

  const today = useLiftingSessions(day);
  const recent = useLiftingSessions();

  const isLoading = today.isLoading || recent.isLoading;
  const isError = today.isError || recent.isError;
  // The recent list includes today's sessions — keep only older ones here.
  const recentOlder = (recent.data ?? []).filter((s) => s.day !== day);

  function toggleSearch() {
    setSearchOpen((open) => {
      if (open) setQuery("");
      return !open;
    });
  }

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-2xl font-bold">Start Workout</h1>
          <button
            type="button"
            aria-label={searchOpen ? "Hide search" : "Search templates"}
            aria-pressed={searchOpen}
            onClick={toggleSearch}
            className="hover:bg-accent flex size-10 items-center justify-center rounded-full transition-colors"
          >
            <Search className="size-5" aria-hidden />
          </button>
        </div>
        {searchOpen && (
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search templates"
            aria-label="Search templates"
          />
        )}
      </header>

      <TemplatesSection query={query} />

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Workouts</h2>
          <Button size="sm" variant="outline" onClick={() => setSheetOpen(true)}>
            <Plus className="size-4" aria-hidden />
            Add set
          </Button>
        </div>

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
      </section>

      <AddSetSheet open={sheetOpen} onOpenChange={setSheetOpen} day={day} />
    </div>
  );
}
