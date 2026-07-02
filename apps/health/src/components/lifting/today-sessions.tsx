import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/today/metric-card";
import { formatNumber } from "@/lib/format";
import type { SessionDTO } from "@/lib/hooks/use-lifting-sessions";

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Today's session(s) as tappable cards that open the detailed session view (the
 *  active workout, with planned-vs-actual progress). More than one appears only
 *  when a >3h gap split the day into separate auto-sessions. */
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
      {sessions.map((session) => {
        const top = session.exercises
          .map((e) => e.exerciseName)
          .slice(0, 3)
          .join(", ");
        return (
          <Link
            key={session.sessionId}
            href={`/lifting/sessions/${session.sessionId}`}
            className="block"
          >
            <Card className="hover:bg-accent flex-row items-center justify-between gap-3 p-4 transition-colors">
              <div className="min-w-0">
                <div className="flex items-center gap-2 font-medium">
                  Today, {timeLabel(session.startedAt)}
                  {session.endedAt != null && (
                    <Badge variant="secondary">Finished</Badge>
                  )}
                </div>
                <div className="text-muted-foreground truncate text-xs">
                  {top || "No sets"}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-right">
                  <div className="text-lg font-semibold tabular-nums">
                    {formatNumber(session.volumeKg)} kg
                  </div>
                  <div className="text-muted-foreground text-xs">
                    {session.workingSets} sets
                  </div>
                </div>
                <ChevronRight
                  className="text-muted-foreground size-4 shrink-0"
                  aria-hidden
                />
              </div>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
