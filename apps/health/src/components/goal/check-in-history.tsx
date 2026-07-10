"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { signedRate } from "@/components/goal/phase";
import { dateLabel, formatNumber } from "@/lib/format";
import type { CheckInDTO } from "@/lib/hooks/use-goal";
import { useDecideCheckIn } from "@/lib/hooks/use-goal-mutations";

const STATUS_LABELS: Record<CheckInDTO["status"], string> = {
  PROPOSED: "Proposed",
  ACCEPTED: "Accepted",
  AUTO_APPLIED: "Applied",
  DISMISSED: "Dismissed",
};

function TargetMove({ c }: { c: CheckInDTO }) {
  if (c.proposedTargetKcal === c.previousTargetKcal) {
    return (
      <span className="tabular-nums">
        {formatNumber(c.previousTargetKcal)} kcal — no change
      </span>
    );
  }
  return (
    <span className="tabular-nums">
      {formatNumber(c.previousTargetKcal)} → {formatNumber(c.proposedTargetKcal)}{" "}
      kcal
    </span>
  );
}

function CheckInRow({ c }: { c: CheckInDTO }) {
  const decide = useDecideCheckIn();
  const pending = c.status === "PROPOSED";

  return (
    <li className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{dateLabel(c.day)}</span>
        <Badge variant={pending ? "default" : "secondary"}>
          {STATUS_LABELS[c.status]}
          {c.decidedVia === "MCP" ? " · MCP" : ""}
        </Badge>
      </div>
      <div className="text-muted-foreground text-xs tabular-nums">
        {c.actualRateKgWk != null
          ? `Trend ${signedRate(c.actualRateKgWk)} kg/wk vs plan ${signedRate(c.plannedRateKgWk)}`
          : `Plan ${signedRate(c.plannedRateKgWk)} kg/wk · no trend measured`}
        {" · "}
        <TargetMove c={c} />
      </div>
      {c.note != null && (
        <p className="text-muted-foreground text-xs">{c.note}</p>
      )}
      {pending && (
        <div className="flex gap-2 pt-1">
          <Button
            className="h-11 flex-1"
            disabled={decide.isPending}
            onClick={() => decide.mutate({ id: c.id, decision: "accept" })}
          >
            Accept
          </Button>
          <Button
            variant="outline"
            className="h-11 flex-1"
            disabled={decide.isPending}
            onClick={() => decide.mutate({ id: c.id, decision: "dismiss" })}
          >
            Dismiss
          </Button>
        </div>
      )}
    </li>
  );
}

/** The weekly check-in history, newest first — PROPOSED rows get one-tap
 *  Accept/Dismiss. Every comparison is trend vs plan; never device calories. */
export function CheckInHistory({ checkIns }: { checkIns: CheckInDTO[] }) {
  if (checkIns.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Weekly check-ins</CardTitle>
        <CardDescription>
          Actual weight trend vs plan, one capped adjustment per week.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {checkIns.map((c) => (
            <CheckInRow key={c.id} c={c} />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
