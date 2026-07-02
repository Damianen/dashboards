import type { WeightMeasurement } from "@/generated/prisma/client";
import { dayOf, dayToDbDate } from "@/lib/dates";
import { logWeightSchema, type LogWeightInput } from "@/lib/schemas/weight";
import { prisma } from "@/server/db";

/**
 * Log a manual weigh-in. Stored with source MANUAL and NO externalId, so the
 * Withings sync's upserts (keyed on externalId) can never touch it; the
 * daily_summary view picks each day's latest measurement regardless of source.
 * Rounded to 2 dp to fit the Decimal(5,2) column exactly.
 */
export async function logWeight(
  input: LogWeightInput,
): Promise<WeightMeasurement> {
  const data = logWeightSchema.parse(input);
  const at = data.measuredAt ? new Date(data.measuredAt) : new Date();
  return prisma.weightMeasurement.create({
    data: {
      measuredAt: at,
      day: dayToDbDate(dayOf(at)),
      weightKg: Math.round(data.weightKg * 100) / 100,
      source: "MANUAL",
    },
  });
}
