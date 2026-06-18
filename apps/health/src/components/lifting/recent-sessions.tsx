import { SessionCard } from "@/components/lifting/session-card";
import type { SessionDTO } from "@/lib/hooks/use-lifting-sessions";

/** Sessions before today, collapsed. Hidden entirely when there are none. */
export function RecentSessions({ sessions }: { sessions: SessionDTO[] }) {
  if (sessions.length === 0) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-muted-foreground text-sm font-medium">Recent</h2>
      <div className="space-y-3">
        {sessions.map((session) => (
          <SessionCard key={session.sessionId} session={session} />
        ))}
      </div>
    </section>
  );
}
