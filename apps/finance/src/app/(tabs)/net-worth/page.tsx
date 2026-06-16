import { formatMoney } from "@/components/dashboard/money";
import { AccountBalances } from "@/components/net-worth/account-balances";
import { NetWorthChart } from "@/components/net-worth/net-worth-chart";
import { getNetWorth, getNetWorthHistory } from "@/server/services/net-worth";

export const dynamic = "force-dynamic";

export default async function NetWorthPage() {
  const [current, history] = await Promise.all([
    getNetWorth(),
    getNetWorthHistory(12),
  ]);

  return (
    <section className="flex flex-col gap-5 py-4">
      <header className="flex flex-col gap-0.5">
        <h1 className="text-2xl font-semibold">Net worth</h1>
        <div className="text-3xl font-semibold tabular-nums">
          {formatMoney(current.total)}
        </div>
        {current.asOf && (
          <span className="text-sm text-muted-foreground">
            As of {current.asOf}
          </span>
        )}
      </header>
      <NetWorthChart points={history.points} />
      <AccountBalances accounts={current.accounts} />
    </section>
  );
}
