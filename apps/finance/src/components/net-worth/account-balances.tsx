import { formatMoney } from "@/components/dashboard/money";
import { Badge } from "@/components/ui/badge";
import type { NetWorthAccountBalance } from "@/lib/net-worth";

export function AccountBalances({
  accounts,
}: {
  accounts: NetWorthAccountBalance[];
}) {
  if (accounts.length === 0) {
    return (
      <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
        No account balances yet.
      </p>
    );
  }

  return (
    <div>
      <h2 className="mb-2 text-sm font-medium text-muted-foreground">Accounts</h2>
      <ul className="flex flex-col gap-3 rounded-xl border bg-card p-4">
        {accounts.map((a) => (
          <li
            key={a.accountId}
            className="flex items-center justify-between gap-2 text-sm"
          >
            <span className="flex min-w-0 items-center gap-2">
              <Badge variant="outline" className="shrink-0">
                {a.bank}
              </Badge>
              <span className="truncate">{a.name}</span>
            </span>
            <span className="shrink-0 tabular-nums">{formatMoney(a.balance)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
