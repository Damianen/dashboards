import { describe, expect, it } from "vitest";

import { Source } from "@/generated/prisma/client";
import type {
  OuraDailyActivityRecord,
  OuraDailyReadinessRecord,
  OuraDailySleepRecord,
  OuraSleepRecord,
} from "@/server/integrations/oura";
import {
  toDailyActivityData,
  toDailyReadinessData,
  toDailySleepData,
  toSleepSessionData,
} from "./oura";

function sleepRecord(over: Partial<OuraSleepRecord> = {}): OuraSleepRecord {
  return {
    id: "sleep-1",
    day: "2026-06-14",
    bedtime_start: "2026-06-13T23:00:00.000Z",
    bedtime_end: "2026-06-14T07:00:00.000Z",
    total_sleep_duration: 27000,
    deep_sleep_duration: 5400,
    rem_sleep_duration: 6000,
    light_sleep_duration: 15600,
    awake_time: 1750,
    latency: 540,
    time_in_bed: 28800,
    efficiency: 92,
    average_heart_rate: 58.4,
    average_hrv: 48.6,
    lowest_heart_rate: 51,
    type: "long_sleep",
    ...over,
  };
}

describe("toSleepSessionData", () => {
  it("converts second durations to whole minutes, rounding half up", () => {
    const d = toSleepSessionData(
      sleepRecord({ total_sleep_duration: 28530, awake_time: 1750 }),
    );
    expect(d.totalSleepMin).toBe(476); // 475.5 → 476
    expect(d.awakeMin).toBe(29); // 29.16 → 29
    expect(toSleepSessionData(sleepRecord({ total_sleep_duration: 28529 }))
      .totalSleepMin).toBe(475); // 475.48 → 475
  });

  it("keeps latency in SECONDS (latencySec column), not minutes", () => {
    expect(toSleepSessionData(sleepRecord({ latency: 540 })).latencySec).toBe(
      540,
    );
  });

  it("uses Oura's assigned `day`, NOT the bucketed bedtime_start", () => {
    // 02:00Z on the 13th buckets to civil day 2026-06-13 via dayOf; Oura assigns it
    // to 2026-06-14, and we must trust Oura's assignment.
    const d = toSleepSessionData(
      sleepRecord({ day: "2026-06-14", bedtime_start: "2026-06-13T02:00:00.000Z" }),
    );
    expect((d.day as Date).toISOString()).toBe("2026-06-14T00:00:00.000Z");
  });

  it("preserves bedtime instants and identity/source fields", () => {
    const d = toSleepSessionData(sleepRecord({ id: "abc" }));
    expect(d.externalId).toBe("abc");
    expect(d.source).toBe(Source.OURA);
    expect((d.bedtimeStart as Date).toISOString()).toBe(
      "2026-06-13T23:00:00.000Z",
    );
    expect((d.bedtimeEnd as Date).toISOString()).toBe(
      "2026-06-14T07:00:00.000Z",
    );
  });

  it("keeps null stage durations null (never coerces to 0)", () => {
    const d = toSleepSessionData(
      sleepRecord({
        deep_sleep_duration: null,
        rem_sleep_duration: null,
        light_sleep_duration: null,
        awake_time: null,
      }),
    );
    expect(d.deepMin).toBeNull();
    expect(d.remMin).toBeNull();
    expect(d.lightMin).toBeNull();
    expect(d.awakeMin).toBeNull();
  });

  it("coalesces a missing total_sleep_duration to 0 (column is non-null)", () => {
    expect(
      toSleepSessionData(sleepRecord({ total_sleep_duration: null }))
        .totalSleepMin,
    ).toBe(0);
  });

  it("rounds avgHrvMs and passes HR fields through, preserving nulls", () => {
    const d = toSleepSessionData(
      sleepRecord({ average_hrv: 48.6, average_heart_rate: 58.4 }),
    );
    expect(d.avgHrvMs).toBe(49);
    expect(d.avgHrBpm).toBe(58.4);
    const n = toSleepSessionData(
      sleepRecord({ average_hrv: null, lowest_heart_rate: null }),
    );
    expect(n.avgHrvMs).toBeNull();
    expect(n.lowestHrBpm).toBeNull();
  });

  it("retains the full record in raw", () => {
    const r = sleepRecord();
    expect(toSleepSessionData(r).raw).toEqual(r);
  });
});

describe("toDailySleepData", () => {
  it("maps day and score, retaining the record (incl. contributors) in raw", () => {
    const r: OuraDailySleepRecord = {
      id: "ds-1",
      day: "2026-06-14",
      score: 82,
      contributors: { deep_sleep: 90, efficiency: 88 },
      timestamp: "2026-06-14T12:00:00.000Z",
    };
    const d = toDailySleepData(r);
    expect((d.day as Date).toISOString()).toBe("2026-06-14T00:00:00.000Z");
    expect(d.score).toBe(82);
    expect(d.raw).toEqual(r);
  });

  it("keeps a null score null", () => {
    const r: OuraDailySleepRecord = {
      id: "ds-2",
      day: "2026-06-15",
      score: null,
      contributors: {},
      timestamp: "",
    };
    expect(toDailySleepData(r).score).toBeNull();
  });
});

describe("toDailyReadinessData", () => {
  function readiness(
    over: Partial<OuraDailyReadinessRecord> = {},
  ): OuraDailyReadinessRecord {
    return {
      id: "dr-1",
      day: "2026-06-14",
      score: 77,
      temperature_deviation: -0.2,
      temperature_trend_deviation: 0.1,
      contributors: { resting_heart_rate: 70, hrv_balance: 88 },
      timestamp: "2026-06-14T12:00:00.000Z",
      ...over,
    };
  }

  it("maps score, temperature deviation, and both contributor scores", () => {
    const d = toDailyReadinessData(readiness());
    expect(d.score).toBe(77);
    expect(d.temperatureDeviation).toBe(-0.2);
    expect(d.restingHrBpm).toBe(70);
    expect(d.hrvBalance).toBe(88);
    expect((d.day as Date).toISOString()).toBe("2026-06-14T00:00:00.000Z");
  });

  it("keeps a null temperature_deviation null", () => {
    expect(
      toDailyReadinessData(readiness({ temperature_deviation: null }))
        .temperatureDeviation,
    ).toBeNull();
  });

  it("defaults missing contributor keys to null", () => {
    const d = toDailyReadinessData(readiness({ contributors: {} }));
    expect(d.restingHrBpm).toBeNull();
    expect(d.hrvBalance).toBeNull();
  });

  it("retains the full record (incl. all contributors) in raw", () => {
    const r = readiness();
    expect(toDailyReadinessData(r).raw).toEqual(r);
  });
});

describe("toDailyActivityData", () => {
  function activity(
    over: Partial<OuraDailyActivityRecord> = {},
  ): OuraDailyActivityRecord {
    return {
      id: "da-1",
      day: "2026-06-14",
      score: 85,
      active_calories: 540,
      total_calories: 2680,
      steps: 11234,
      contributors: { steps: 95, training_volume: 80 },
      timestamp: "2026-06-14T12:00:00.000Z",
      ...over,
    };
  }

  it("maps active/total calories and steps, tagging the source OURA", () => {
    const d = toDailyActivityData(activity());
    expect(d.activeKcal).toBe(540);
    expect(d.totalKcal).toBe(2680);
    expect(d.steps).toBe(11234);
    expect(d.source).toBe(Source.OURA);
  });

  it("uses Oura's assigned `day` straight through dayToDbDate (UTC midnight)", () => {
    const d = toDailyActivityData(activity({ day: "2026-06-14" }));
    expect((d.day as Date).toISOString()).toBe("2026-06-14T00:00:00.000Z");
  });

  it("keeps null metrics null (never coerces to 0)", () => {
    const d = toDailyActivityData(
      activity({ active_calories: null, total_calories: null, steps: null }),
    );
    expect(d.activeKcal).toBeNull();
    expect(d.totalKcal).toBeNull();
    expect(d.steps).toBeNull();
  });

  it("retains the full record in raw", () => {
    const r = activity();
    expect(toDailyActivityData(r).raw).toEqual(r);
  });
});
