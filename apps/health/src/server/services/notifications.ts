import { SyncSource } from "@/generated/prisma/client";
import { shiftDay, todayLocal } from "@/lib/dates";
import {
  isOkToErrorTransition,
  waterNudgeMessage,
  weeklySummaryMessage,
} from "@/lib/notifications";
import { prisma } from "@/server/db";
import { sendToAll } from "@/server/services/push";
import { getDailySummary, getTrends } from "@/server/services/summary";
import { getWaterStatus } from "@/server/services/water";

// Server-side source labels for notification copy. Kept here (not imported from
// the client SOURCE_META) so this service has no client-component dependency.
const SOURCE_LABELS: Record<SyncSource, string> = {
  [SyncSource.OURA]: "Oura",
  [SyncSource.WITHINGS]: "Withings",
  [SyncSource.GOOGLE_HEALTH]: "Google Health",
};

/** Evening nudge: if today's water is under target, remind with the litres remaining. */
export async function waterNudge(): Promise<void> {
  const { waterMl, targetMl } = await getWaterStatus();
  const message = waterNudgeMessage(waterMl, targetMl);
  if (message) await sendToAll(message);
}

/**
 * Alert when `source` just flipped OK→ERROR: the latest run failed and the one
 * before it succeeded. No-op on a healthy run, the first-ever failure, or a
 * repeated failure — a persistently broken feed alerts once, not every tick.
 */
export async function alertSyncFailure(source: SyncSource): Promise<void> {
  const [latest, previous] = await prisma.syncRun.findMany({
    where: { source },
    orderBy: { startedAt: "desc" },
    take: 2,
  });
  if (!isOkToErrorTransition(latest?.status, previous?.status)) return;
  await sendToAll({
    title: `${SOURCE_LABELS[source]} sync failing`,
    body: latest?.error ?? "The latest sync ended with an error.",
    url: "/settings",
  });
}

/**
 * Sunday-evening summary of independent honest metrics: the weight 7-day-average
 * delta vs last week, the week's total lifting volume, and the average sleep
 * score. Deliberately NOT an energy balance (see CLAUDE.md domain guardrails).
 */
export async function weeklySummary(): Promise<void> {
  const today = todayLocal();

  const [current, prior] = await Promise.all([
    getDailySummary(today),
    getDailySummary(shiftDay(today, -7)),
  ]);
  const weight7dAvgDeltaKg =
    current?.weight7dAvg != null && prior?.weight7dAvg != null
      ? current.weight7dAvg - prior.weight7dAvg
      : null;

  const [volume, sleep] = await Promise.all([
    getTrends("lifting_volume_kg", 7),
    getTrends("sleep_score", 7),
  ]);
  const totalLiftingVolumeKg = volume.length
    ? volume.reduce((sum, point) => sum + point.value, 0)
    : null;
  const avgSleepScore = sleep.length
    ? sleep.reduce((sum, point) => sum + point.value, 0) / sleep.length
    : null;

  await sendToAll(
    weeklySummaryMessage({
      weight7dAvgDeltaKg,
      totalLiftingVolumeKg,
      avgSleepScore,
    }),
  );
}
