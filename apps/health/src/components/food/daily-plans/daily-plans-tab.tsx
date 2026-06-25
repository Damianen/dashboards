"use client";

import { useState } from "react";
import { Pencil, Plus } from "lucide-react";

import { DailyPlanBuilderSheet } from "@/components/food/daily-plans/daily-plan-builder-sheet";
import { EmptyState } from "@/components/today/metric-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber } from "@/lib/format";
import { useApplyDailyPlan } from "@/lib/hooks/use-apply-daily-plan";
import { useDailyPlans } from "@/lib/hooks/use-daily-plans";

/**
 * The "Plans" view inside the Food page: saved daily plans with their item count and
 * total kcal. "Apply" logs every item into the viewed day's diary as its own entry;
 * the pencil edits the plan; "New plan" opens the builder.
 */
export function DailyPlansTab({ day }: { day: string }) {
  const { data, isLoading, isError, isFetching, refetch } = useDailyPlans();
  const plans = data ?? [];
  const apply = useApplyDailyPlan();

  const [builderOpen, setBuilderOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  function openNew() {
    setEditId(null);
    setBuilderOpen(true);
  }
  function openEdit(id: string) {
    setEditId(id);
    setBuilderOpen(true);
  }

  return (
    <div className="space-y-3">
      <Button className="h-12 w-full text-base" onClick={openNew}>
        <Plus className="size-5" aria-hidden />
        New plan
      </Button>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-md" />
          ))}
        </div>
      ) : isError ? (
        <div className="space-y-3 py-8 text-center">
          <p className="text-muted-foreground text-sm">Couldn&apos;t load plans.</p>
          <Button
            variant="outline"
            onClick={() => void refetch()}
            disabled={isFetching}
          >
            Retry
          </Button>
        </div>
      ) : plans.length === 0 ? (
        <div className="py-10 text-center">
          <EmptyState>
            No plans yet. Create one to log a typical day in one tap.
          </EmptyState>
        </div>
      ) : (
        <ul className="space-y-2">
          {plans.map((plan) => {
            const applying = apply.isPending && apply.variables?.id === plan.id;
            return (
              <li
                key={plan.id}
                className="bg-card space-y-2 rounded-md border p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{plan.name}</div>
                    <div className="text-muted-foreground text-xs tabular-nums">
                      {plan.itemCount} item{plan.itemCount === 1 ? "" : "s"} ·{" "}
                      {formatNumber(plan.totalKcal ?? 0)} kcal
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-label={`Edit ${plan.name}`}
                    onClick={() => openEdit(plan.id)}
                    className="hover:bg-accent flex size-9 shrink-0 items-center justify-center rounded-md transition-colors"
                  >
                    <Pencil className="size-4" aria-hidden />
                  </button>
                </div>
                <Button
                  className="h-11 w-full"
                  disabled={apply.isPending}
                  onClick={() => apply.mutate({ id: plan.id, day })}
                >
                  {applying ? "Applying…" : "Apply"}
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      <DailyPlanBuilderSheet
        open={builderOpen}
        onOpenChange={setBuilderOpen}
        planId={editId}
      />
    </div>
  );
}
