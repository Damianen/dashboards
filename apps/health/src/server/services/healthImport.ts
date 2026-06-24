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

const KJ_PER_KCAL = 4.184;

/**
 * Active-energy → kcal. HAE reports energy in the user's locale unit: kJ (metric) or
 * kcal (imperial), carried in the measurement's `units`. The DB column is kcal, so a kJ
 * value is converted; kcal (or an unknown/missing unit) is taken as-is. Wrist EE is only
 * ever a relative trend estimate (per the domain guardrails) — this just keeps the unit honest.
 */
function energyKcalOf(value: unknown): number | null {
  const qty = qtyOf(value);
  if (qty == null) return null;
  const units =
    isRecord(value) && typeof value.units === "string"
      ? value.units.toLowerCase()
      : null;
  return units === "kj" ? qty / KJ_PER_KCAL : qty;
}

/**
 * Parse a HAE datetime into a Date. HAE's actual export format is locale-dependent and
 * `new Date()` parses none of them reliably, so we normalize explicitly:
 *
 *  - 12-hour clock: "2026-06-24 5:53:24 PM +0200" — 1–2 digit hour + AM/PM + a
 *    space-separated, colon-less offset (what HAE emits here). Converted to 24-hour ISO.
 *  - 24-hour: "2026-06-20 07:05:00 +0000" — space (not 'T') before the time, colon-less
 *    offset. Separators normalized.
 *  - native ISO ("2025-01-21T10:30:00Z") passes straight through.
 *
 * Returns null when the value is missing or unparseable, so the caller skips that workout
 * rather than storing an Invalid Date.
 */
export function parseHaeDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();

  // 12-hour AM/PM form. new Date() can't parse it, so rebuild an ISO string: convert the
  // hour to 24h (12 AM → 0, 12 PM → 12) and give the offset a colon.
  const ampm = trimmed.match(
    /^(\d{4}-\d{2}-\d{2}) (\d{1,2}):(\d{2}):(\d{2}) (AM|PM) ([+-]\d{2}):?(\d{2})$/i,
  );
  if (ampm) {
    const [, date, hh, mm, ss, meridiem, offHour, offMin] = ampm;
    const hour = (Number(hh) % 12) + (meridiem?.toUpperCase() === "PM" ? 12 : 0);
    const iso = `${date}T${String(hour).padStart(2, "0")}:${mm}:${ss}${offHour}:${offMin}`;
    const parsed = new Date(iso);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  // 24-hour HAE form / native ISO.
  const normalized = trimmed
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
      activeEnergyKcal:
        energyKcalOf(item.activeEnergyBurned) ?? energyKcalOf(item.activeEnergy),
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
