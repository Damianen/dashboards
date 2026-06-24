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

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "a", "a and b", "a, b and c". */
function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  const last = items.at(-1) ?? "";
  return `${items.slice(0, -1).join(", ")} and ${last}`;
}

/**
 * A gentle under-recovery heads-up naming which signals (`offMetrics`, friendly phrases like
 * "resting heart rate") sit off the recent baseline. Framed as something to consider — never a
 * diagnosis — and always carries the "trend signal, not medical advice" caveat (CLAUDE.md).
 * Returns null when nothing is off baseline.
 */
export function recoveryHeadsUpMessage(
  offMetrics: string[],
): NotificationMessage | null {
  if (offMetrics.length === 0) return null;
  return {
    title: "Heads up — possible under-recovery",
    body: `${capitalize(joinList(offMetrics))} ${offMetrics.length === 1 ? "is" : "are"} off your recent baseline. Might be a good day to take it easy. Trend signal, not medical advice.`,
    url: "/insights",
  };
}

/** Which adherence streak a milestone celebration is for. */
export type StreakKind = "food" | "supplements";

/**
 * A celebratory milestone push for a logging streak. Motivating, never nagging — fired only
 * when a streak REACHES a milestone (7/30/100), never when one breaks (CLAUDE.md).
 */
export function streakMilestoneMessage(
  kind: StreakKind,
  milestone: number,
): NotificationMessage {
  const what = kind === "food" ? "food logging" : "supplements";
  return {
    title: `${milestone}-day streak 🔥`,
    body: `${milestone} days of ${what} in a row — keep it going!`,
    url: "/",
  };
}
