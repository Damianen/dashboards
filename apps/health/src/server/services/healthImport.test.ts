import { describe, expect, it } from "vitest";

import { parseHaeDate, parseWorkouts } from "./healthImport";

/** A representative HAE export-Version-2 workout payload (metadata only, no GPS route). */
function payloadWith(...workouts: Record<string, unknown>[]) {
  return { data: { metrics: [], workouts } };
}

/** Parse a one-workout payload and return the single normalized row (asserting it exists). */
function parseOne(workout: Record<string, unknown>) {
  const workouts = parseWorkouts(payloadWith(workout));
  expect(workouts).toHaveLength(1);
  const [w] = workouts;
  if (!w) throw new Error("expected exactly one parsed workout");
  return w;
}

describe("parseHaeDate", () => {
  it("normalizes HAE's space-separated UTC format to the right instant", () => {
    // "2026-06-20 07:05:00 +0000" — space (not 'T') + colon-less offset.
    expect(parseHaeDate("2026-06-20 07:05:00 +0000")?.toISOString()).toBe(
      "2026-06-20T07:05:00.000Z",
    );
  });

  it("handles a non-UTC offset", () => {
    expect(parseHaeDate("2025-01-21 14:30:45 -0500")?.toISOString()).toBe(
      "2025-01-21T19:30:45.000Z",
    );
  });

  it("passes native ISO ('T'…'Z') straight through", () => {
    expect(parseHaeDate("2025-01-21T10:30:00Z")?.toISOString()).toBe(
      "2025-01-21T10:30:00.000Z",
    );
  });

  it("parses HAE's 12-hour AM/PM format with a single-digit hour", () => {
    // The real shape HAE emits in a metric/12-hour locale; 5:53 PM +02:00 = 15:53 UTC.
    expect(parseHaeDate("2026-06-24 5:53:24 PM +0200")?.toISOString()).toBe(
      "2026-06-24T15:53:24.000Z",
    );
    expect(parseHaeDate("2026-06-24 5:53:24 AM +0200")?.toISOString()).toBe(
      "2026-06-24T03:53:24.000Z",
    );
  });

  it("tolerates the non-ASCII spaces iOS/ICU use (U+202F narrow no-break, U+00A0)", () => {
    // THE production bug: HAE sends a NARROW NO-BREAK SPACE (U+202F) before AM/PM, not an
    // ASCII space, so the original literal-space regex skipped every workout. Built via
    // fromCharCode so the source stays ASCII and the intent is unambiguous.
    const nnbsp = String.fromCharCode(0x202f); // narrow no-break space (iOS/ICU)
    const nbsp = String.fromCharCode(0x00a0); // no-break space
    expect(
      parseHaeDate(`2026-06-24 5:53:24${nnbsp}PM +0200`)?.toISOString(),
    ).toBe("2026-06-24T15:53:24.000Z");
    expect(
      parseHaeDate(`2026-06-24 5:53:24${nbsp}PM${nbsp}+0200`)?.toISOString(),
    ).toBe("2026-06-24T15:53:24.000Z");
  });

  it("handles the 12 AM/PM hour boundaries", () => {
    // 12 PM = noon, 12 AM = midnight (rolls to the previous UTC day at +02:00).
    expect(parseHaeDate("2026-06-24 12:30:00 PM +0200")?.toISOString()).toBe(
      "2026-06-24T10:30:00.000Z",
    );
    expect(parseHaeDate("2026-06-24 12:30:00 AM +0200")?.toISOString()).toBe(
      "2026-06-23T22:30:00.000Z",
    );
  });

  it("returns null for missing or unparseable values", () => {
    expect(parseHaeDate(undefined)).toBeNull();
    expect(parseHaeDate(123)).toBeNull();
    expect(parseHaeDate("not a date")).toBeNull();
  });
});

describe("parseWorkouts", () => {
  it("maps a full HAE workout to a normalized row", () => {
    const w = parseOne({
      id: "ABC-123",
      name: "Outdoor Run",
      start: "2026-06-20 07:05:00 +0000",
      end: "2026-06-20 07:50:00 +0000",
      duration: 2700,
      distance: { qty: 5.2, units: "km" },
      activeEnergyBurned: { qty: 250, units: "kcal" },
      heartRate: {
        avg: { qty: 130.4, units: "bpm" },
        max: { qty: 165, units: "bpm" },
      },
    });

    expect(w.externalId).toBe("ABC-123");
    expect(w.source).toBe("apple_health");
    expect(w.type).toBe("Outdoor Run");
    expect(w.name).toBe("Outdoor Run");
    expect((w.startedAt as Date).toISOString()).toBe("2026-06-20T07:05:00.000Z");
    expect((w.endedAt as Date).toISOString()).toBe("2026-06-20T07:50:00.000Z");
    expect(w.durationSeconds).toBe(2700);
    expect(w.distance).toBe(5.2);
    expect(w.activeEnergyKcal).toBe(250);
    expect(w.avgHeartRate).toBe(130); // rounded from 130.4
    expect(w.maxHeartRate).toBe(165);
  });

  it("imports a real HAE 12-hour-clock workout (regression: was skipped → imported 0)", () => {
    // Real shape, including the U+202F before PM that broke production.
    const nnbsp = String.fromCharCode(0x202f);
    const w = parseOne({
      id: "B6EE4FF3",
      name: "Binnen Wandelen",
      start: `2026-06-24 5:53:24${nnbsp}PM +0200`,
      end: `2026-06-24 6:05:10${nnbsp}PM +0200`,
      duration: 706.45,
      distance: { qty: 0.857, units: "km" },
      activeEnergyBurned: { qty: 723.2, units: "kJ" },
    });
    expect((w.startedAt as Date).toISOString()).toBe("2026-06-24T15:53:24.000Z");
    expect(w.durationSeconds).toBe(706);
    expect((w.day as Date).toISOString()).toBe("2026-06-24T00:00:00.000Z");
  });

  it("converts kJ active-energy to kcal, and passes kcal through unchanged", () => {
    const kj = parseOne({
      name: "Walk",
      start: "2026-06-20 07:05:00 +0000",
      activeEnergyBurned: { qty: 723.2, units: "kJ" },
    });
    expect(kj.activeEnergyKcal).toBeCloseTo(172.85, 1); // 723.2 / 4.184

    const kcal = parseOne({
      name: "Walk",
      start: "2026-06-20 07:05:00 +0000",
      activeEnergyBurned: { qty: 250, units: "kcal" },
    });
    expect(kcal.activeEnergyKcal).toBe(250);
  });

  it("buckets the civil day in Europe/Amsterdam, not UTC", () => {
    // 2026-06-19 23:30 UTC is 2026-06-20 01:30 in Amsterdam (summer, +02:00).
    const w = parseOne({ name: "Walk", start: "2026-06-19 23:30:00 +0000" });
    expect((w.day as Date).toISOString()).toBe("2026-06-20T00:00:00.000Z");
  });

  it("reads top-level avg/max heart-rate summaries when heartRate is absent", () => {
    const w = parseOne({
      name: "Cycling",
      start: "2026-06-20 07:05:00 +0000",
      avgHeartRate: { qty: 142, units: "bpm" },
      maxHeartRate: { qty: 171, units: "bpm" },
    });
    expect(w.avgHeartRate).toBe(142);
    expect(w.maxHeartRate).toBe(171);
  });

  it("synthesizes externalId from type + start when id is missing", () => {
    const w = parseOne({ name: "Strength", start: "2026-06-20 07:05:00 +0000" });
    expect(w.externalId).toBe("Strength:2026-06-20T07:05:00.000Z");
  });

  it("leaves optional measurements null when absent", () => {
    const w = parseOne({ name: "Yoga", start: "2026-06-20 07:05:00 +0000" });
    expect(w.endedAt).toBeNull();
    expect(w.durationSeconds).toBeNull();
    expect(w.distance).toBeNull();
    expect(w.activeEnergyKcal).toBeNull();
    expect(w.avgHeartRate).toBeNull();
    expect(w.maxHeartRate).toBeNull();
  });

  it("skips a workout whose start cannot be parsed", () => {
    expect(parseWorkouts(payloadWith({ name: "Broken" }))).toEqual([]);
  });

  it.each([
    ["null", null],
    ["empty object", {}],
    ["no workouts key", { data: {} }],
    ["empty workouts array", { data: { workouts: [] } }],
    ["non-array workouts", { data: { workouts: "nope" } }],
  ])("returns [] for a zero-workout payload (%s)", (_label, payload) => {
    expect(parseWorkouts(payload)).toEqual([]);
  });
});
