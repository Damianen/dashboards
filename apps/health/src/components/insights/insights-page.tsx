import { ObservationHistoryCard } from "@/components/insights/observation-history-card";
import { ObservationsCard } from "@/components/insights/observations-card";

export function InsightsPage() {
  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">Insights</h1>
        <p className="text-muted-foreground text-sm">
          Cross-domain patterns — hypotheses to explore, not proof
        </p>
      </header>
      <ObservationsCard />
      <ObservationHistoryCard />
    </div>
  );
}
