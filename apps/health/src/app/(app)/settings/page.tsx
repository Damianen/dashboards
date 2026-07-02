import { CalorieTargetCard } from "@/components/settings/calorie-target-card";
import { ConnectionsSection } from "@/components/settings/connections-section";
import { NotificationsCard } from "@/components/settings/notifications-card";
import { ProteinTargetCard } from "@/components/settings/protein-card";
import { SyncStatusCard } from "@/components/settings/sync-status-card";
import { WaterSettingsCard } from "@/components/settings/water-settings-card";
import { WeightGoalCard } from "@/components/settings/weight-goal-card";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="text-muted-foreground text-sm">Targets, connections &amp; sync</p>
      </header>
      <section className="space-y-3">
        <h2 className="text-muted-foreground text-sm font-medium">Targets</h2>
        <ProteinTargetCard />
        <CalorieTargetCard />
        <WeightGoalCard />
        <WaterSettingsCard />
      </section>
      <SyncStatusCard />
      <NotificationsCard />
      <ConnectionsSection />
    </div>
  );
}
