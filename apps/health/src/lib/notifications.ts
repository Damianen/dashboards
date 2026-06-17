// Pure, DB-free message formatting + predicates for the notification jobs.
// Kept apart from the services so the copy and the OK→ERROR transition rule are
// exhaustively unit-testable without a database or web-push (see CLAUDE.md).

import { SyncStatus } from "@/generated/prisma/client";

/** A push payload: the service worker reads exactly these fields. */
export interface NotificationMessage {
  title: string;
  body: string;
  url: string;
}

/** Millilitres → litres with one decimal, e.g. 1100 → "1.1 L", 2700 → "2.7 L". */
export function formatLiters(ml: number): string {
  return `${(ml / 1000).toFixed(1)} L`;
}

/**
 * The evening water nudge, or null when the target is already met. Body reads
 * "1.1 L to go — target 2.7 L today" (remaining clamped at 0).
 */
export function waterNudgeMessage(
  waterMl: number,
  targetMl: number,
): NotificationMessage | null {
  const remainingMl = targetMl - waterMl;
  if (remainingMl <= 0) return null;
  return {
    title: "Water reminder",
    body: `${formatLiters(remainingMl)} to go — target ${formatLiters(targetMl)} today`,
    url: "/",
  };
}

/**
 * True only on an OK→ERROR transition: the latest run failed and the one before
 * it succeeded. Alerts fire on the transition, never on every repeated failure.
 */
export function isOkToErrorTransition(
  latest: SyncStatus | undefined,
  previous: SyncStatus | undefined,
): boolean {
  return latest === SyncStatus.ERROR && previous === SyncStatus.OK;
}

function signedKg(deltaKg: number): string {
  const sign = deltaKg < 0 ? "−" : "+";
  return `${sign}${Math.abs(deltaKg).toFixed(1)} kg`;
}

/**
 * The Sunday-evening weekly summary. Independent honest metrics only — weight
 * 7-day-average delta vs last week, total lifting volume, average sleep score.
 * Never an energy balance (intake − expenditure). Missing metrics render "—".
 */
export function weeklySummaryMessage(input: {
  weight7dAvgDeltaKg: number | null;
  totalLiftingVolumeKg: number | null;
  avgSleepScore: number | null;
}): NotificationMessage {
  const weight =
    input.weight7dAvgDeltaKg == null ? "—" : signedKg(input.weight7dAvgDeltaKg);
  const lifting =
    input.totalLiftingVolumeKg == null
      ? "—"
      : `${Math.round(input.totalLiftingVolumeKg).toLocaleString("en-US")} kg`;
  const sleep =
    input.avgSleepScore == null ? "—" : `${Math.round(input.avgSleepScore)}`;
  return {
    title: "Weekly summary",
    body: `Weight ${weight} vs last week · Lifting ${lifting} · Sleep ${sleep} avg`,
    url: "/",
  };
}
