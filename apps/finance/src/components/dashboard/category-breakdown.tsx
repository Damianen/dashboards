import type { CategorySpend } from "@/lib/analytics";

import { formatMoney } from "./money";

export function CategoryBreakdown({ items }: { items: CategorySpend[] }) {
  const max = Math.max(0, ...items.map((x) => Number(x.amount)));
  return (
    <div>
      <h2 className="mb-2 text-sm font-medium text-muted-foreground">
        Spending by category
      </h2>
      {items.length === 0 ? (
        <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
          No spending yet this month.
        </p>
      ) : (
        <ul className="flex flex-col gap-3 rounded-xl border bg-card p-4">
          {items.map((i) => {
            const pct = max > 0 ? (Number(i.amount) / max) * 100 : 0;
            return (
              <li
                key={i.categoryId ?? "uncategorized"}
                className="flex flex-col gap-1"
              >
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className="size-3 shrink-0 rounded-full"
                      style={{ backgroundColor: i.color }}
                      aria-hidden
                    />
                    <span className="truncate">{i.name}</span>
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {formatMoney(i.amount)}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${pct}%`, backgroundColor: i.color }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
