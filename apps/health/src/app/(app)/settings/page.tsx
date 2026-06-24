import { ConnectionsSection } from "@/components/settings/connections-section";
import { NotificationsCard } from "@/components/settings/notifications-card";
import { ProteinTargetCard } from "@/components/settings/protein-card";
import { SyncStatusCard } from "@/components/settings/sync-status-card";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="text-muted-foreground text-sm">Targets, connections &amp; sync</p>
      </header>
      <ProteinTargetCard />
      <SyncStatusCard />
      <NotificationsCard />
      <ConnectionsSection />
    </div>
  );
}
