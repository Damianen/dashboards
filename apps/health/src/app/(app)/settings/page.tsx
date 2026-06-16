import { ConnectionsSection } from "@/components/settings/connections-section";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="text-muted-foreground text-sm">Connections &amp; sync</p>
      </header>
      <ConnectionsSection />
    </div>
  );
}
