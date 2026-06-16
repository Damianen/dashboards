import { formatMoney } from "@/components/dashboard/money";
import { SubscriptionList } from "@/components/subscriptions/subscription-list";
import { listSubscriptions } from "@/server/services/recurrence";

export const dynamic = "force-dynamic";

export default async function SubscriptionsPage() {
  const { monthlyTotal, subscriptions } = await listSubscriptions();

  return (
    <section className="flex flex-col gap-3 py-4">
      <header className="flex items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold">Subscriptions</h1>
        <span className="text-sm tabular-nums text-muted-foreground">
          {formatMoney(monthlyTotal)}/mo
        </span>
      </header>
      <p className="text-sm text-muted-foreground">
        Recurring payments detected from your transaction history.
      </p>
      <SubscriptionList subscriptions={subscriptions} />
    </section>
  );
}
