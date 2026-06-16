"use client";

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { CategoryPickerSheet } from "@/components/inbox/category-picker-sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { CategoryListItem, InboxItem, InboxPage } from "@/lib/inbox";
import { cn } from "@/lib/utils";
import { categorize, rerunRules } from "@/server/actions/categorize";

const BANK_LABELS: Record<string, string> = {
  ING: "ING",
  REVOLUT: "Revolut",
  KLARNA: "Klarna",
};

const dateFmt = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  timeZone: "Europe/Amsterdam",
});

function formatDate(isoDate: string): string {
  return dateFmt.format(new Date(`${isoDate}T00:00:00Z`));
}

function formatAmount(amount: string, currency: string): string {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency }).format(
    Number(amount),
  );
}

async function fetchInbox(cursor: string | null): Promise<InboxPage> {
  const url = cursor
    ? `/api/inbox?cursor=${encodeURIComponent(cursor)}`
    : "/api/inbox";
  const res = await fetch(url);
  if (!res.ok) throw new Error(`inbox ${res.status}`);
  return (await res.json()) as InboxPage;
}

async function fetchCategories(): Promise<CategoryListItem[]> {
  const res = await fetch("/api/categories");
  if (!res.ok) throw new Error(`categories ${res.status}`);
  return (await res.json()) as CategoryListItem[];
}

export function InboxList() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<InboxItem | null>(null);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
  } = useInfiniteQuery({
    queryKey: ["inbox"],
    queryFn: ({ pageParam }) => fetchInbox(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });

  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: fetchCategories,
    staleTime: 5 * 60_000,
  });

  const mutation = useMutation({
    mutationFn: (vars: {
      transactionId: string;
      categoryId: string;
      createRule: boolean;
    }) => categorize(vars),
    onMutate: async (vars) => {
      // Stop in-flight refetches from clobbering the optimistic removal.
      await qc.cancelQueries({ queryKey: ["inbox"] });
      const prev = qc.getQueryData<InfiniteData<InboxPage>>(["inbox"]);
      qc.setQueryData<InfiniteData<InboxPage>>(["inbox"], (old) =>
        old
          ? {
              ...old,
              pages: old.pages.map((p) => ({
                ...p,
                items: p.items.filter((it) => it.id !== vars.transactionId),
              })),
            }
          : old,
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(["inbox"], ctx.prev);
    },
    onSettled: () => {
      // A created rule may have filed sibling rows too — only a refetch knows.
      void qc.invalidateQueries({ queryKey: ["inbox"] });
    },
  });

  const rerun = useMutation({
    mutationFn: () => rerunRules(),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["inbox"] });
    },
  });

  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          void fetchNextPage();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  function handlePick(categoryId: string, createRule: boolean) {
    if (!selected) return;
    mutation.mutate({ transactionId: selected.id, categoryId, createRule });
    setSelected(null);
  }

  if (isLoading) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
    );
  }
  if (isError) {
    return (
      <p className="py-8 text-center text-sm text-destructive">
        Couldn’t load the inbox.
      </p>
    );
  }

  const items = data?.pages.flatMap((p) => p.items) ?? [];
  if (items.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        Inbox zero — nothing to categorize. 🎉
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          disabled={rerun.isPending}
          onClick={() => rerun.mutate()}
        >
          {rerun.isPending ? "Re-running…" : "Re-run rules"}
        </Button>
      </div>

      <ul className="flex flex-col divide-y divide-border">
        {items.map((t) => {
          const negative = t.amount.trim().startsWith("-");
          const title = t.counterparty ?? t.merchantKey ?? t.descriptionRaw ?? "—";
          const subtitle = t.merchantKey ?? t.descriptionRaw;
          return (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => setSelected(t)}
                className="flex w-full items-center justify-between gap-3 py-3 text-left active:bg-muted/50"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="truncate font-medium">{title}</span>
                  <div className="flex min-w-0 items-center gap-2">
                    <Badge variant="outline" className="shrink-0">
                      {BANK_LABELS[t.bank] ?? t.bank}
                      {t.accountName ? ` · ${t.accountName}` : ""}
                    </Badge>
                    {subtitle && (
                      <span className="truncate text-xs text-muted-foreground">
                        {subtitle}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span
                    className={cn(
                      "font-semibold tabular-nums",
                      negative
                        ? "text-destructive"
                        : "text-emerald-600 dark:text-emerald-500",
                    )}
                  >
                    {formatAmount(t.amount, t.currency)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(t.bookingDate)}
                  </span>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
      <div ref={sentinel} aria-hidden />
      {isFetchingNextPage && (
        <p className="py-4 text-center text-sm text-muted-foreground">
          Loading more…
        </p>
      )}

      <CategoryPickerSheet
        item={selected}
        categories={categoriesQuery.data ?? []}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        onPick={handlePick}
      />
    </div>
  );
}
