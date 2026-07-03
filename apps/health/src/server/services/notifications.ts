import { SyncSource } from "@/generated/prisma/client";
import { dayToDbDate, shiftDay, timeOfDay, todayLocal } from "@/lib/dates";
import {
  eveningBriefingMessage,
  isOkToErrorTransition,
  morningBriefingMessage,
  recoveryHeadsUpMessage,
  type StreakKind,
  streakMilestoneMessage,
  waterNudgeMessage,
  weeklySummaryMessage,
} from "@/lib/notifications";
import { prisma } from "@/server/db";
import { getAdherence } from "@/server/services/adherence";
import { getBriefing } from "@/server/services/briefing";
import { getFreshObservation } from "@/server/services/observations";
import { getRecovery } from "@/server/services/recovery";
import { sendToAll } from "@/server/services/push";
import { getBriefingSettings } from "@/server/services/settings";
import { getDailySummary, getTrends } from "@/server/services/summary";
import { syncSource } from "@/server/services/sync";
import { getWaterStatus } from "@/server/services/water";

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
 * Daily observation digest. Fires at most ONE noteworthy never-pushed observation — the
 * strongest, per getFreshObservation — recording it so it never re-fires and no more than
 * one fires per day. Every observation is a correlational hypothesis with its n stated
 * (the finding text), never a causal claim and never used to change a target (CLAUDE.md).
 */
export async function observationDigest(): Promise<void> {
  const today = todayLocal();

  // Throttle: at most one observation push per day. Cheap short-circuit before computing.
  const pushedToday = await prisma.notifiedObservation.findFirst({
    where: { day: dayToDbDate(today) },
  });
  if (pushedToday) return;

  const fresh = await getFreshObservation();
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

// Friendly phrases for the heads-up copy, keyed by recovery metric.
const RECOVERY_METRIC_PHRASES = {
  restingHr: "resting heart rate",
  hrv: "HRV",
  tempDeviation: "body temperature",
} as const;

/**
 * After the morning Oura sync: when today's recovery read is "high" (one strong signal, or
 * several deviating together), push a gentle under-recovery heads-up ONCE per episode. Deduped
 * by the episode's start day — once recovery returns to baseline a later episode (a new start
 * day) can fire again. A trend signal, never a diagnosis (CLAUDE.md). Insufficient baseline ⇒
 * no flag ⇒ no push. Records only after a device actually received it, so a high day before any
 * subscription exists isn't silently used up.
 */
export async function recoveryHeadsUp(): Promise<void> {
  const recovery = await getRecovery();
  if (recovery.status !== "high" || recovery.episodeStart == null) return;

  const episodeStart = dayToDbDate(recovery.episodeStart);
  const already = await prisma.notifiedRecoveryEpisode.findUnique({
    where: { episodeStart },
  });
  if (already) return;

  const offMetrics = (["restingHr", "hrv", "tempDeviation"] as const)
    .filter((key) => {
      const flag = recovery.metrics[key].flag;
      return flag === "elevated" || flag === "high";
    })
    .map((key) => RECOVERY_METRIC_PHRASES[key]);
  const message = recoveryHeadsUpMessage(offMetrics);
  if (!message) return;

  const { sent } = await sendToAll(message);
  if (sent === 0) return;
  await prisma.notifiedRecoveryEpisode.create({
    data: { episodeStart, status: recovery.status },
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

// Per-slot last-sent day, persisted as settings rows (additive — no migration).
const BRIEFING_LAST_SENT_KEYS = {
  morning: "briefing.lastSentMorning",
  evening: "briefing.lastSentEvening",
} as const;

// How long the morning dispatch waits for a fresh Oura pull before composing anyway.
const OURA_SYNC_TIMEOUT_MS = 60_000;

/**
 * Minute-tick dispatcher for the two briefing pushes. A slot fires when its
 * configured Amsterdam wall-clock time has passed, it's enabled, and it hasn't
 * fired today — send times stay settings-editable without cron re-registration,
 * and a restart catches up later the same day.
 *
 * The last-sent day is CLAIMED before compose/send — the opposite of the
 * notified-* record-after-sent convention, deliberately: on a minute tick,
 * recording only after a successful send would recompose and retry every
 * minute all day whenever push is unconfigured. At-most-once per slot per day;
 * a crash mid-compose skips that day's push (accepted).
 */
export async function briefingDispatch(): Promise<void> {
  const settings = await getBriefingSettings();
  const today = todayLocal();
  const now = timeOfDay(new Date());

  for (const slot of ["morning", "evening"] as const) {
    if (!settings[slot].enabled) continue;
    // Both sides are zero-padded "HH:mm", so lexicographic order is time order.
    if (now < settings[slot].time) continue;

    const key = BRIEFING_LAST_SENT_KEYS[slot];
    const lastSent = await prisma.setting.findUnique({ where: { key } });
    if (lastSent != null && String(lastSent.value) === today) continue;
    await prisma.setting.upsert({
      where: { key },
      create: { key, value: today },
      update: { value: today },
    });

    if (slot === "morning") {
      // Best-effort freshness: give the Oura sync up to 60s, then compose with
      // the latest available data regardless (stale readings get labeled with
      // their day). The sync guard makes overlap with the 2-hourly cron safe.
      await Promise.race([
        syncSource(SyncSource.OURA).catch((err) =>
          console.error("[briefing] oura sync failed", err),
        ),
        new Promise((resolve) => setTimeout(resolve, OURA_SYNC_TIMEOUT_MS)),
      ]);
    }

    const briefing = await getBriefing(slot, today);
    const message =
      slot === "morning"
        ? morningBriefingMessage(briefing.headline)
        : eveningBriefingMessage(briefing.headline, briefing.sections.unfinished);
    await sendToAll(message);
  }
}
