import { CategoryBreakdown } from "@/components/dashboard/category-breakdown";
import { OverviewLinks } from "@/components/dashboard/overview-links";
import { SummaryCards } from "@/components/dashboard/summary-cards";
import { TrendChart } from "@/components/dashboard/trend-chart";
import { getDashboard } from "@/server/services/analytics";
import { getNetWorth } from "@/server/services/net-worth";
import { listSubscriptions } from "@/server/services/recurrence";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  // All aggregation happens in SQL; this server component only fetches + lays out.
  const [{ summary, byCategory, trend }, netWorth, subscriptions] =
    await Promise.all([getDashboard(), getNetWorth(), listSubscriptions()]);

  return (
    <section className="flex flex-col gap-5 py-4">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Overview</h1>
        <span className="text-sm text-muted-foreground">This month</span>
      </header>
      <SummaryCards summary={summary} />
      <OverviewLinks
        netWorthTotal={netWorth.total}
        monthlyTotal={subscriptions.monthlyTotal}
      />
      <CategoryBreakdown items={byCategory} />
      <TrendChart points={trend} />
    </section>
  );
}
