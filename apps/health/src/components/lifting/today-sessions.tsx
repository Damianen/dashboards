import { SessionCard } from "@/components/lifting/session-card";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/today/metric-card";
import type { SessionDTO } from "@/lib/hooks/use-lifting-sessions";

/** Today's session(s), expanded. More than one appears only when a >3h gap split
 *  the day into separate auto-sessions. */
export function TodaySessions({ sessions }: { sessions: SessionDTO[] }) {
  if (sessions.length === 0) {
    return (
      <Card className="p-4">
        <EmptyState>No sets logged today.</EmptyState>
      </Card>
    );
  }
  return (
    <div className="space-y-3">
      {sessions.map((session) => (
        <SessionCard key={session.sessionId} session={session} defaultExpanded />
      ))}
    </div>
  );
}
