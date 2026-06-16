import type { DashboardSummary } from "@/lib/analytics";
import { cn } from "@/lib/utils";

import { formatMoney } from "./money";

export function SummaryCards({ summary }: { summary: DashboardSummary }) {
  const savingsPct = `${Math.round(summary.savingsRate * 100)}%`;
  const netNegative = Number(summary.net) < 0;

  const cards: { label: string; value: string; tone: "income" | "expense" | "neutral" }[] =
    [
      { label: "Income", value: formatMoney(summary.income), tone: "income" },
      { label: "Expenses", value: formatMoney(summary.expenses), tone: "expense" },
      {
        label: "Net",
        value: formatMoney(summary.net),
        tone: netNegative ? "expense" : "income",
      },
      { label: "Savings rate", value: savingsPct, tone: "neutral" },
    ];

  return (
    <div className="grid grid-cols-2 gap-3">
      {cards.map((c) => (
        <div
          key={c.label}
          className="rounded-xl border bg-card p-4 transition-colors hover:border-primary/30"
        >
          <div className="text-xs text-muted-foreground">{c.label}</div>
          <div
            className={cn(
              "mt-1 text-xl font-semibold tabular-nums",
              c.tone === "expense" && "text-destructive",
              c.tone === "income" && "text-emerald-500",
              c.tone === "neutral" && "text-foreground",
            )}
          >
            {c.value}
          </div>
        </div>
      ))}
    </div>
  );
}
