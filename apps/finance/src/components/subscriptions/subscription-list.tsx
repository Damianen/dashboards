import { formatMoney } from "@/components/dashboard/money";
import { Badge } from "@/components/ui/badge";
import type { SubscriptionView } from "@/lib/subscriptions";

const dateFmt = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "Europe/Amsterdam",
});

/** "2026-07-01" -> "1 Jul". */
function formatDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return dateFmt.format(new Date(Date.UTC(year, month - 1, day)));
}

export function SubscriptionList({
  subscriptions,
}: {
  subscriptions: SubscriptionView[];
}) {
  if (subscriptions.length === 0) {
    return (
      <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
        No subscriptions detected yet. They appear once a merchant shows a
        regular weekly, monthly, or quarterly pattern.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {subscriptions.map((s, i) => (
        <li
          key={s.id}
          style={{ animationDelay: `${i * 60}ms` }}
          className="flex items-center justify-between gap-3 rounded-xl border bg-card p-4 transition-colors duration-500 fill-mode-both animate-in fade-in slide-in-from-bottom-2 hover:border-primary/30"
        >
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate font-medium">{s.name}</span>
              {s.priceIncreased && s.previousAmount && (
                <Badge variant="destructive">
                  ↑ from {formatMoney(s.previousAmount)}
                </Badge>
              )}
              {s.missed && <Badge variant="outline">Missed</Badge>}
            </div>
            <div className="text-xs text-muted-foreground">
              {s.intervalLabel} · next {formatDate(s.nextExpected)} ·{" "}
              {formatMoney(s.monthlyEquivalent)}/mo
            </div>
          </div>
          <span className="shrink-0 font-semibold tabular-nums">
            {formatMoney(s.amount)}
          </span>
        </li>
      ))}
    </ul>
  );
}
