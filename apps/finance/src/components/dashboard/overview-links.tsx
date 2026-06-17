import { ChevronRight } from "lucide-react";
import Link from "next/link";

import { formatMoney } from "./money";

// Two dashboard entry points to the insight pages that don't get their own tab.
export function OverviewLinks({
  netWorthTotal,
  monthlyTotal,
}: {
  netWorthTotal: string;
  monthlyTotal: string;
}) {
  const cards = [
    {
      href: "/net-worth",
      label: "Net worth",
      value: formatMoney(netWorthTotal),
      sub: "Total balance",
    },
    {
      href: "/subscriptions",
      label: "Subscriptions",
      value: formatMoney(monthlyTotal),
      sub: "Per month",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3">
      {cards.map((c) => (
        <Link
          key={c.href}
          href={c.href}
          className="group flex min-h-20 flex-col gap-1 rounded-xl border bg-card p-4 transition-all duration-200 hover:border-primary/40 hover:bg-accent/40 active:scale-[0.98]"
        >
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            {c.label}
            <ChevronRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
          </div>
          <div className="text-xl font-semibold tabular-nums">{c.value}</div>
          <div className="text-[0.65rem] text-muted-foreground">{c.sub}</div>
        </Link>
      ))}
    </div>
  );
}
