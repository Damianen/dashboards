"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { TransactionsPage } from "@/lib/transactions";

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
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency,
  }).format(Number(amount));
}

async function fetchPage(cursor: string | null): Promise<TransactionsPage> {
  const url = cursor
    ? `/api/transactions?cursor=${encodeURIComponent(cursor)}`
    : "/api/transactions";
  const res = await fetch(url);
  if (!res.ok) throw new Error(`transactions ${res.status}`);
  return (await res.json()) as TransactionsPage;
}

export function TransactionList() {
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
  } = useInfiniteQuery({
    queryKey: ["transactions"],
    queryFn: ({ pageParam }) => fetchPage(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
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

  if (isLoading) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
    );
  }
  if (isError) {
    return (
      <p className="py-8 text-center text-sm text-destructive">
        Couldn’t load transactions.
      </p>
    );
  }

  const items = data?.pages.flatMap((p) => p.items) ?? [];
  if (items.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        No transactions yet. Connect a bank in Settings, then Sync.
      </div>
    );
  }

  return (
    <div>
      <ul className="flex flex-col divide-y divide-border">
        {items.map((t) => {
          const negative = t.amount.trim().startsWith("-");
          const title = t.counterparty ?? t.descriptionRaw ?? "—";
          const subtitle = t.counterparty ? t.descriptionRaw : null;
          return (
            <li
              key={t.id}
              className="flex items-center justify-between gap-3 py-3"
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
    </div>
  );
}
