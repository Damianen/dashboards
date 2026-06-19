import { Prisma } from "@/generated/prisma/client";
import { dayOf, dayToDbDate } from "@/lib/dates";
import { prisma } from "@/server/db";

/**
 * Ingest of Apple Watch workouts pushed from the Health Auto Export (HAE) iOS app.
 *
 * HAE emits export "Version 2": `{ data: { workouts: [...], metrics: [...] } }`,
 * where numeric measurements are `{ qty, units }` objects (not bare numbers). We
 * parse DEFENSIVELY — fields are read where present and degrade to null otherwise,
 * never throwing on a missing field — because the parser is built from HAE's docs,
 * not a captured sample. The endpoint's HEALTH_IMPORT_DEBUG flag logs the first real
 * payload so the shape can be confirmed and this parser tightened later.
 *
 * Only `data.workouts` is consumed today; `data.metrics` (and other HAE types) can be
 * added as sibling parsers without touching this one.
 */

/** A parsed, DB-ready workout row. `externalId` is always populated so re-sends upsert. */
export type NormalizedWorkout = Prisma.WorkoutUncheckedCreateInput;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A non-empty string, trimmed-checked; otherwise null. */
function strOf(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/**
 * Pull a numeric quantity from a HAE measurement: either a `{ qty, units }` object
 * (the common case) or a bare finite number. Anything else (arrays of samples,
 * missing keys) → null. Units are intentionally dropped from the typed column but
 * preserved in the row's `raw` JSON for later normalization.
 */
function qtyOf(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (isRecord(value) && typeof value.qty === "number" && Number.isFinite(value.qty)) {
    return value.qty;
  }
  return null;
}

function roundOrNull(value: number | null): number | null {
  return value == null ? null : Math.round(value);
}

/**
 * Parse a HAE datetime into a Date. HAE emits non-ISO strings such as
 * "2026-06-20 07:05:00 +0000" — a space (not 'T') before the time and a space before
 * a colon-less UTC offset — which `new Date()` parses inconsistently. Normalize the
 * separators explicitly first; native ISO ("2025-01-21T10:30:00Z") passes straight
 * through unchanged. Returns null when the value is missing or unparseable, so the
 * caller can skip that workout rather than store an Invalid Date.
 */
export function parseHaeDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== "string") return null;
  const normalized = value
    .trim()
    .replace(/^(\d{4}-\d{2}-\d{2}) /, "$1T") // "YYYY-MM-DD " → "YYYY-MM-DDT"
    .replace(/ ([+-]\d{2})(\d{2})$/, "$1:$2") // " +0000" → "+00:00"
    .replace(/ ([+-]\d{2}:\d{2})$/, "$1"); // " +00:00" → "+00:00"
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * PURE: map a HAE payload to DB-ready workout rows. No I/O. A payload with no
 * `data.workouts` array (or an empty one) yields `[]`. The civil `day` is bucketed
 * from `startedAt` through the single dayOf() chokepoint (Europe/Amsterdam). A
 * workout whose start can't be parsed is skipped, not thrown on.
 */
export function parseWorkouts(payload: unknown): NormalizedWorkout[] {
  const data = isRecord(payload) ? payload.data : null;
  const list = isRecord(data) ? data.workouts : null;
  if (!Array.isArray(list)) return [];

  const workouts: NormalizedWorkout[] = [];
  for (const item of list) {
    if (!isRecord(item)) continue;

    const startedAt = parseHaeDate(item.start);
    if (!startedAt) continue; // no start → can't bucket a civil day; skip

    const type = strOf(item.name) ?? "Workout";
    const externalId = strOf(item.id) ?? `${type}:${startedAt.toISOString()}`;

    // Heart rate arrives either as top-level avgHeartRate/maxHeartRate summaries or
    // nested under heartRate.{avg,max}; accept whichever HAE sends.
    const heartRate = isRecord(item.heartRate) ? item.heartRate : null;
    const avgHeartRate = qtyOf(item.avgHeartRate) ?? (heartRate ? qtyOf(heartRate.avg) : null);
    const maxHeartRate = qtyOf(item.maxHeartRate) ?? (heartRate ? qtyOf(heartRate.max) : null);

    workouts.push({
      externalId,
      source: "apple_health",
      type,
      name: strOf(item.name),
      startedAt,
      endedAt: parseHaeDate(item.end),
      durationSeconds: roundOrNull(qtyOf(item.duration)),
      day: dayToDbDate(dayOf(startedAt)),
      distance: qtyOf(item.distance),
      activeEnergyKcal: qtyOf(item.activeEnergyBurned) ?? qtyOf(item.activeEnergy),
      avgHeartRate: roundOrNull(avgHeartRate),
      maxHeartRate: roundOrNull(maxHeartRate),
      raw: item as unknown as Prisma.InputJsonValue,
    });
  }
  return workouts;
}

export interface ImportResult {
  imported: number;
}

/**
 * Persist parsed workouts. Idempotent: each row UPSERTs by its unique externalId, so
 * HAE's overlapping re-sends collapse to ONE row, never duplicates. An empty array is
 * a no-op returning { imported: 0 }.
 */
export async function upsertWorkouts(workouts: NormalizedWorkout[]): Promise<ImportResult> {
  let imported = 0;
  for (const data of workouts) {
    await prisma.workout.upsert({
      where: { externalId: data.externalId },
      create: data,
      update: data,
    });
    imported++;
  }
  return { imported };
}
