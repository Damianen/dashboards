import { SyncSource } from "@/generated/prisma/client";
import { dayToDbDate, shiftDay, todayLocal } from "@/lib/dates";
import {
  isOkToErrorTransition,
  type StreakKind,
  streakMilestoneMessage,
  waterNudgeMessage,
  weeklySummaryMessage,
} from "@/lib/notifications";
import { prisma } from "@/server/db";
import { getAdherence } from "@/server/services/adherence";
import { getObservations } from "@/server/services/observations";
import { sendToAll } from "@/server/services/push";
import { getDailySummary, getTrends } from "@/server/services/summary";
import { getWaterStatus } from "@/server/services/water";

// A pushed observation must clear both bars: a moderate correlation (|r| ≥ 0.4) over a
// real sample (n ≥ 12). Below this it's noise we don't interrupt the day for.
const NOTEWORTHY_STRENGTH = 0.4;
const NOTEWORTHY_MIN_N = 12;

// Server-side source labels for notification copy. Kept here (not imported from
// the client SOURCE_META) so this service has no client-component dependency.
const SOURCE_LABELS: Partial<Record<SyncSource, string>> = {
  [SyncSource.OURA]: "Oura",
  [SyncSource.WITHINGS]: "Withings",
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
    title: `${SOURCE_LABELS[source] ?? source} sync failing`,
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

/**
 * Daily observation digest. Computes the cross-domain observations, keeps only the
 * noteworthy ones we've never pushed, and fires at most ONE — the strongest — recording it
 * so it never re-fires and no more than one fires per day. Every observation is a
 * correlational hypothesis with its n stated (the finding text), never a causal claim and
 * never used to change a target (CLAUDE.md).
 */
export async function observationDigest(): Promise<void> {
  const today = todayLocal();

  // Throttle: at most one observation push per day. Cheap short-circuit before computing.
  const pushedToday = await prisma.notifiedObservation.findFirst({
    where: { day: dayToDbDate(today) },
  });
  if (pushedToday) return;

  const { observations } = await getObservations();
  const noteworthy = observations.filter(
    (o) => Math.abs(o.strength) >= NOTEWORTHY_STRENGTH && o.n >= NOTEWORTHY_MIN_N,
  );
  if (noteworthy.length === 0) return;

  // Dedupe: drop any observation already pushed, then take the strongest remaining
  // (observations arrive ranked by |strength|).
  const seen = await prisma.notifiedObservation.findMany({
    where: { observationId: { in: noteworthy.map((o) => o.id) } },
    select: { observationId: true },
  });
  const seenIds = new Set(seen.map((s) => s.observationId));
  const fresh = noteworthy.find((o) => !seenIds.has(o.id));
  if (!fresh) return;

  const { sent } = await sendToAll({
    title: "New observation",
    body: fresh.finding,
    url: "/insights",
  });
  // Only record once it actually reached a device — otherwise an observation found before
  // any subscription exists would be silently "used up" and never seen.
  if (sent === 0) return;
  await prisma.notifiedObservation.create({
    data: { observationId: fresh.id, day: dayToDbDate(today) },
  });
}

/**
 * Celebrate logging streaks that have reached a milestone (7/30/100). For each streak we push
 * the highest not-yet-celebrated milestone once, deduped by (streakType, milestone, startDay):
 * a given milestone fires once per streak RUN, and a fresh streak (new start day) celebrates
 * again. We fire on length ≥ milestone (not only the exact day), so a missed or
 * no-subscriber day re-fires later. A broken streak is silent — there is simply nothing to
 * celebrate (no guilt pings, CLAUDE.md). Records only after a device actually received it.
 */
export async function streakMilestones(): Promise<void> {
  const today = todayLocal();
  const adherence = await getAdherence(today);

  const streaks: { type: StreakKind; reached: number[]; startDay: string | null }[] = [
    {
      type: "food",
      reached: adherence.foodStreak.milestonesReached,
      startDay: adherence.foodStreak.startDay,
    },
    {
      type: "supplements",
      reached: adherence.supplementStreak.milestonesReached,
      startDay: adherence.supplementStreak.startDay,
    },
  ];

  for (const { type, reached, startDay } of streaks) {
    if (reached.length === 0 || startDay == null) continue;
    const dbStartDay = dayToDbDate(startDay);

    // Milestones already celebrated for THIS run (same start day) — never re-fire those.
    const recorded = await prisma.notifiedStreakMilestone.findMany({
      where: { streakType: type, startDay: dbStartDay, milestone: { in: reached } },
      select: { milestone: true },
    });
    const recordedSet = new Set(recorded.map((r) => r.milestone));
    const fresh = reached.filter((m) => !recordedSet.has(m));
    if (fresh.length === 0) continue;

    // Celebrate the most impressive new milestone once; a backfill that jumps past several
    // shouldn't spam every lower one.
    const top = Math.max(...fresh);
    const { sent } = await sendToAll(streakMilestoneMessage(type, top));
    // Only record once it reached a device — otherwise a milestone hit before any subscription
    // exists would be silently used up and never celebrated.
    if (sent === 0) continue;
    // Record every newly-passed milestone (incl. the lower ones the jump surpassed) so none
    // re-fires later in this run.
    await prisma.notifiedStreakMilestone.createMany({
      data: fresh.map((milestone) => ({ streakType: type, milestone, startDay: dbStartDay })),
      skipDuplicates: true,
    });
  }
}
