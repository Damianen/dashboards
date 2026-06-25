"use client";

import { ClipboardList } from "lucide-react";

import { MetricCard } from "@/components/today/metric-card";
import { Button } from "@/components/ui/button";
import { todayLocal } from "@/lib/dates";
import { formatNumber } from "@/lib/format";
import { useApplyDailyPlan } from "@/lib/hooks/use-apply-daily-plan";
import { useDailyPlans } from "@/lib/hooks/use-daily-plans";

/**
 * One-tap "apply a daily plan to today" shortcut on the home dashboard — the morning
 * logging path. Each tap logs every plan item as its own diary entry for today, then
 * the food/summary caches refetch. Hidden until at least one plan exists so the
 * dashboard stays clean.
 */
export function ApplyPlanCard() {
  const { data } = useDailyPlans();
  const apply = useApplyDailyPlan();
  const day = todayLocal();
  const plans = data ?? [];

  if (plans.length === 0) return null;

  return (
    <MetricCard title="Apply a plan" icon={ClipboardList}>
      <ul className="space-y-2">
        {plans.map((plan) => {
          const applying = apply.isPending && apply.variables?.id === plan.id;
          return (
            <li key={plan.id} className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{plan.name}</div>
                <div className="text-muted-foreground text-xs tabular-nums">
                  {plan.itemCount} item{plan.itemCount === 1 ? "" : "s"} ·{" "}
                  {formatNumber(plan.totalKcal ?? 0)} kcal
                </div>
              </div>
              <Button
                size="sm"
                className="shrink-0"
                disabled={apply.isPending}
                onClick={() => apply.mutate({ id: plan.id, day })}
              >
                {applying ? "Applying…" : "Apply"}
              </Button>
            </li>
          );
        })}
      </ul>
    </MetricCard>
  );
}
