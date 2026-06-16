"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useState } from "react";

import { BudgetBar } from "@/components/budgets/budget-bar";
import { BudgetEditorSheet } from "@/components/budgets/budget-editor-sheet";
import { formatMoney } from "@/components/dashboard/money";
import { Button } from "@/components/ui/button";
import { budgetProgress, type BudgetStatus } from "@/lib/budget-pacing";
import type { BudgetsResponse, BudgetView } from "@/lib/budgets";
import type { CategoryListItem } from "@/lib/inbox";
import { cn } from "@/lib/utils";
import { copyLastMonth, removeBudget, saveBudget } from "@/server/actions/budgets";

const STATUS: Record<BudgetStatus, { label: string; className: string }> = {
  under: { label: "On track", className: "text-emerald-600 dark:text-emerald-500" },
  on: { label: "Ahead of pace", className: "text-amber-600 dark:text-amber-500" },
  over: { label: "Over budget", className: "text-destructive" },
};

async function fetchBudgets(): Promise<BudgetsResponse> {
  const res = await fetch("/api/budgets");
  if (!res.ok) throw new Error(`budgets ${res.status}`);
  return (await res.json()) as BudgetsResponse;
}

async function fetchCategories(): Promise<CategoryListItem[]> {
  const res = await fetch("/api/categories");
  if (!res.ok) throw new Error(`categories ${res.status}`);
  return (await res.json()) as CategoryListItem[];
}

/** Recompute one category's row for an optimistic save (real spent on refetch). */
function applyOptimisticSave(
  old: BudgetsResponse,
  vars: { categoryId: string; limit: string },
  categories: CategoryListItem[],
): BudgetsResponse {
  const limit = Number(vars.limit);
  const now = new Date();
  const existing = old.budgets.find((b) => b.categoryId === vars.categoryId);

  if (existing) {
    const p = budgetProgress(Number(existing.spent), limit, now);
    const updated: BudgetView = {
      ...existing,
      limit: limit.toFixed(2),
      spentFraction: p.spentFraction,
      paceFraction: p.paceFraction,
      projected: p.projected.toFixed(2),
      status: p.status,
    };
    return {
      ...old,
      budgets: old.budgets.map((b) => (b.id === existing.id ? updated : b)),
    };
  }

  const cat = categories.find((c) => c.id === vars.categoryId);
  const p = budgetProgress(0, limit, now);
  const created: BudgetView = {
    id: `optimistic-${vars.categoryId}`,
    categoryId: vars.categoryId,
    categoryName: cat?.name ?? "…",
    categoryColor: cat?.color ?? "#808080",
    month: old.month,
    limit: limit.toFixed(2),
    spent: "0.00",
    spentFraction: p.spentFraction,
    paceFraction: p.paceFraction,
    projected: p.projected.toFixed(2),
    status: p.status,
  };
  const budgets = [...old.budgets, created].sort((a, b) =>
    a.categoryName.localeCompare(b.categoryName),
  );
  return { ...old, budgets };
}

export function BudgetList() {
  const qc = useQueryClient();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorTarget, setEditorTarget] = useState<BudgetView | null>(null);

  const budgetsQuery = useQuery({ queryKey: ["budgets"], queryFn: fetchBudgets });
  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: fetchCategories,
    staleTime: 5 * 60_000,
  });

  const budgets = budgetsQuery.data?.budgets ?? [];
  const budgeted = new Set(budgets.map((b) => b.categoryId));
  const available = (categoriesQuery.data ?? []).filter(
    (c) => c.kind === "expense" && !budgeted.has(c.id),
  );

  const saveMutation = useMutation({
    mutationFn: (vars: { categoryId: string; limit: string }) => saveBudget(vars),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: ["budgets"] });
      const prev = qc.getQueryData<BudgetsResponse>(["budgets"]);
      qc.setQueryData<BudgetsResponse>(["budgets"], (old) =>
        old ? applyOptimisticSave(old, vars, categoriesQuery.data ?? []) : old,
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["budgets"], ctx.prev);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["budgets"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => removeBudget(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ["budgets"] });
      const prev = qc.getQueryData<BudgetsResponse>(["budgets"]);
      qc.setQueryData<BudgetsResponse>(["budgets"], (old) =>
        old ? { ...old, budgets: old.budgets.filter((b) => b.id !== id) } : old,
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["budgets"], ctx.prev);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["budgets"] }),
  });

  const copyMutation = useMutation({
    mutationFn: () => copyLastMonth(),
    onSettled: () => void qc.invalidateQueries({ queryKey: ["budgets"] }),
  });

  const mutating = saveMutation.isPending || deleteMutation.isPending;

  function openCreate() {
    setEditorTarget(null);
    setEditorOpen(true);
  }
  function openEdit(b: BudgetView) {
    setEditorTarget(b);
    setEditorOpen(true);
  }
  function handleSave(categoryId: string, limit: string) {
    saveMutation.mutate({ categoryId, limit });
    setEditorOpen(false);
  }
  function handleDelete(id: string) {
    deleteMutation.mutate(id);
    setEditorOpen(false);
  }

  if (budgetsQuery.isLoading) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>;
  }
  if (budgetsQuery.isError) {
    return (
      <p className="py-8 text-center text-sm text-destructive">
        Couldn’t load budgets.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={openCreate}>
          <Plus className="size-4" aria-hidden />
          Add budget
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={copyMutation.isPending}
          onClick={() => copyMutation.mutate()}
        >
          {copyMutation.isPending ? "Copying…" : "Copy last month"}
        </Button>
      </div>

      {budgets.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          No budgets yet. Add one to track a category against a monthly limit.
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {budgets.map((b) => {
            const status = STATUS[b.status];
            const percent = Math.round(b.spentFraction * 100);
            return (
              <li key={b.id}>
                <button
                  type="button"
                  onClick={() => openEdit(b)}
                  className="flex w-full flex-col gap-2 rounded-xl border border-border p-4 text-left active:bg-muted/50"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className="size-3 shrink-0 rounded-full"
                        style={{ backgroundColor: b.categoryColor }}
                        aria-hidden
                      />
                      <span className="truncate font-medium">{b.categoryName}</span>
                    </span>
                    <span className="shrink-0 tabular-nums">
                      <span className="font-semibold">{formatMoney(b.spent)}</span>
                      <span className="text-muted-foreground">
                        {" "}
                        / {formatMoney(b.limit)}
                      </span>
                    </span>
                  </div>

                  <BudgetBar
                    spentFraction={b.spentFraction}
                    paceFraction={b.paceFraction}
                    status={b.status}
                  />

                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className={cn("font-medium", status.className)}>
                      {status.label}
                    </span>
                    <span className="text-muted-foreground tabular-nums">
                      {percent}% · proj. {formatMoney(b.projected)}
                    </span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <BudgetEditorSheet
        open={editorOpen}
        target={editorTarget}
        categories={available}
        pending={mutating}
        onOpenChange={(open) => setEditorOpen(open)}
        onSave={handleSave}
        onDelete={handleDelete}
      />
    </div>
  );
}
