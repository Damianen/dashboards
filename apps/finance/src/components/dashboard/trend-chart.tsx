import type { TrendPoint } from "@/lib/analytics";

import { formatMoney, formatMonthLabel } from "./money";

export function TrendChart({ points }: { points: TrendPoint[] }) {
  // 1 floor avoids a divide-by-zero when every month is empty.
  const max = Math.max(
    1,
    ...points.flatMap((p) => [Number(p.income), Number(p.expense)]),
  );

  return (
    <div>
      <h2 className="mb-2 text-sm font-medium text-muted-foreground">
        Income vs expenses · 6 months
      </h2>
      <div className="rounded-xl border bg-card p-4">
        <div className="flex items-end gap-2" style={{ height: 160 }}>
          {points.map((p) => {
            const incomeH = (Number(p.income) / max) * 100;
            const expenseH = (Number(p.expense) / max) * 100;
            return (
              <div
                key={p.month}
                className="flex h-full flex-1 flex-col items-center"
              >
                <div className="flex w-full flex-1 items-end justify-center gap-0.5">
                  <div
                    className="w-2.5 rounded-t bg-emerald-500"
                    style={{ height: `${incomeH}%` }}
                    title={`Income ${formatMoney(p.income)}`}
                  />
                  <div
                    className="w-2.5 rounded-t bg-destructive"
                    style={{ height: `${expenseH}%` }}
                    title={`Expenses ${formatMoney(p.expense)}`}
                  />
                </div>
                <span className="mt-1 text-[0.65rem] text-muted-foreground">
                  {formatMonthLabel(p.month)}
                </span>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex items-center justify-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-emerald-500" aria-hidden />
            Income
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-destructive" aria-hidden />
            Expenses
          </span>
        </div>
      </div>
    </div>
  );
}
