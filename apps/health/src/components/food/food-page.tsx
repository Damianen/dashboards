"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";

import { AddFoodSheet } from "@/components/food/add-food-sheet";
import { DailyPlansTab } from "@/components/food/daily-plans/daily-plans-tab";
import { DayTotalBar } from "@/components/food/day-total-bar";
import { MealSection } from "@/components/food/meal-section";
import { MealsTab } from "@/components/food/meals/meals-tab";
import { EmptyState } from "@/components/today/metric-card";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { shiftDay, todayLocal } from "@/lib/dates";
import { dateLabel } from "@/lib/format";
import { dayTotal, groupByMeal, toView } from "@/lib/food";
import { useFoodEntries } from "@/lib/hooks/use-food-entries";

function dayHeading(day: string): string {
  const today = todayLocal();
  if (day === today) return "Today";
  if (day === shiftDay(today, -1)) return "Yesterday";
  return dateLabel(day);
}

function PageSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full rounded-md" />
      ))}
    </div>
  );
}

export function FoodPage() {
  // PWA-shortcut deep link: /food?quick=add opens the sheet on launch. Lazy
  // initial state — never a setState-in-effect.
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const fromShortcut = searchParams.get("quick") === "add";
  const [day, setDay] = useState(todayLocal());
  const [sheetOpen, setSheetOpen] = useState(() => fromShortcut);
  const [tab, setTab] = useState<"diary" | "meals" | "plans">("diary");

  // Consume the shortcut param so a reload/session-restore doesn't re-open a
  // sheet the user dismissed. URL cleanup only — no state updates.
  useEffect(() => {
    if (fromShortcut) window.history.replaceState(null, "", pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once, on mount
  }, []);

  const { data, isLoading, isError, isFetching, refetch } = useFoodEntries(day);
  const views = useMemo(() => (data ?? []).map(toView), [data]);
  const groups = useMemo(() => groupByMeal(views), [views]);
  const total = useMemo(() => dayTotal(views), [views]);

  const atToday = day === todayLocal();

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Food</h1>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Previous day"
            onClick={() => setDay((d) => shiftDay(d, -1))}
            className="hover:bg-accent flex size-9 items-center justify-center rounded-md transition-colors"
          >
            <ChevronLeft className="size-5" aria-hidden />
          </button>
          <span className="min-w-24 text-center text-sm font-medium">
            {dayHeading(day)}
          </span>
          <button
            type="button"
            aria-label="Next day"
            onClick={() => setDay((d) => shiftDay(d, 1))}
            disabled={atToday}
            className="hover:bg-accent flex size-9 items-center justify-center rounded-md transition-colors disabled:pointer-events-none disabled:opacity-30"
          >
            <ChevronRight className="size-5" aria-hidden />
          </button>
        </div>
      </header>

      <Segmented
        ariaLabel="Food view"
        value={tab}
        onChange={setTab}
        options={[
          { value: "diary", label: "Diary" },
          { value: "meals", label: "Meals" },
          { value: "plans", label: "Plans" },
        ]}
      />

      {tab === "meals" ? (
        <MealsTab day={day} />
      ) : tab === "plans" ? (
        <DailyPlansTab day={day} />
      ) : (
        <>
          <DayTotalBar total={total} />

          <Button
            className="h-12 w-full text-base"
            onClick={() => setSheetOpen(true)}
          >
            <Plus className="size-5" aria-hidden />
            Add food
          </Button>

          {isLoading ? (
            <PageSkeleton />
          ) : isError ? (
            <div className="space-y-3 py-8 text-center">
              <p className="text-muted-foreground text-sm">
                Couldn&apos;t load your food log.
              </p>
              <Button
                variant="outline"
                onClick={() => void refetch()}
                disabled={isFetching}
              >
                Retry
              </Button>
            </div>
          ) : groups.length === 0 ? (
            <div className="py-10 text-center">
              <EmptyState>No food logged for this day yet.</EmptyState>
            </div>
          ) : (
            <div className="space-y-5">
              {groups.map((group) => (
                <MealSection key={group.label} group={group} day={day} />
              ))}
            </div>
          )}

          <AddFoodSheet open={sheetOpen} onOpenChange={setSheetOpen} day={day} />
        </>
      )}
    </div>
  );
}
