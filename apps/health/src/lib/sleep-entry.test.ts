import { describe, expect, it } from "vitest";

import { DomainError } from "@/server/services/errors";
import { resolveSleepWindow } from "./sleep-entry";

const NOW = new Date("2026-07-04T07:30:00.000Z");

describe("resolveSleepWindow", () => {
  it("back-computes the start from the end on the duration path", () => {
    const w = resolveSleepWindow(
      { durationMin: 450, bedtimeEnd: "2026-07-04T07:30:00+02:00" },
      NOW,
    );
    expect(w.bedtimeEnd).toEqual(new Date("2026-07-04T05:30:00.000Z"));
    expect(w.bedtimeStart).toEqual(new Date("2026-07-03T22:00:00.000Z"));
    expect(w.totalSleepMin).toBe(450);
  });

  it("defaults the end to the injected now ('woke just now')", () => {
    const w = resolveSleepWindow({ durationMin: 60 }, NOW);
    expect(w.bedtimeEnd).toBe(NOW);
    expect(w.bedtimeStart).toEqual(new Date("2026-07-04T06:30:00.000Z"));
    expect(w.totalSleepMin).toBe(60);
  });

  it("computes a whole-minute duration on the times path", () => {
    const w = resolveSleepWindow(
      {
        bedtimeStart: "2026-07-03T23:30:00+02:00",
        bedtimeEnd: "2026-07-04T07:30:00+02:00",
      },
      NOW,
    );
    expect(w.totalSleepMin).toBe(480);
  });

  it("rounds sub-minute remainders to the nearest minute", () => {
    // 7h59m40s → 479.67 min rounds to 480; 7h59m20s → 479.33 rounds to 479.
    expect(
      resolveSleepWindow(
        {
          bedtimeStart: "2026-07-03T23:30:20+02:00",
          bedtimeEnd: "2026-07-04T07:30:00+02:00",
        },
        NOW,
      ).totalSleepMin,
    ).toBe(480);
    expect(
      resolveSleepWindow(
        {
          bedtimeStart: "2026-07-03T23:30:40+02:00",
          bedtimeEnd: "2026-07-04T07:30:00+02:00",
        },
        NOW,
      ).totalSleepMin,
    ).toBe(479);
  });

  it("measures a DST-switch night in true elapsed minutes (pure ms maths)", () => {
    // Amsterdam clocks fall back 03:00 CEST → 02:00 CET on 2026-10-25: the
    // wall clock reads 23:00 → 08:00 (9h) but the night really lasted 10h.
    const w = resolveSleepWindow(
      {
        bedtimeStart: "2026-10-24T23:00:00+02:00",
        bedtimeEnd: "2026-10-25T08:00:00+01:00",
      },
      NOW,
    );
    expect(w.totalSleepMin).toBe(600);
  });

  it("rejects end ≤ start", () => {
    expect(() =>
      resolveSleepWindow(
        {
          bedtimeStart: "2026-07-04T07:30:00+02:00",
          bedtimeEnd: "2026-07-04T07:30:00+02:00",
        },
        NOW,
      ),
    ).toThrow(DomainError);
    expect(() =>
      resolveSleepWindow(
        {
          bedtimeStart: "2026-07-04T08:00:00+02:00",
          bedtimeEnd: "2026-07-04T07:30:00+02:00",
        },
        NOW,
      ),
    ).toThrow("after bedtimeStart");
  });

  it("rejects a span over 24h on both paths, allowing exactly 24h", () => {
    expect(() =>
      resolveSleepWindow(
        {
          bedtimeStart: "2026-07-03T07:00:00+02:00",
          bedtimeEnd: "2026-07-04T07:30:00+02:00",
        },
        NOW,
      ),
    ).toThrow("at most 24 hours");
    expect(
      resolveSleepWindow(
        {
          bedtimeStart: "2026-07-03T07:30:00+02:00",
          bedtimeEnd: "2026-07-04T07:30:00+02:00",
        },
        NOW,
      ).totalSleepMin,
    ).toBe(1440);
    expect(() => resolveSleepWindow({ durationMin: 1441 }, NOW)).toThrow(
      "at most 24 hours",
    );
  });

  it("rejects a sub-minute span", () => {
    expect(() =>
      resolveSleepWindow(
        {
          bedtimeStart: "2026-07-04T07:29:50+02:00",
          bedtimeEnd: "2026-07-04T07:30:00+02:00",
        },
        NOW,
      ),
    ).toThrow("at least a minute");
  });

  it("re-checks the XOR the schema enforces upstream", () => {
    expect(() => resolveSleepWindow({}, NOW)).toThrow(DomainError);
    expect(() =>
      resolveSleepWindow(
        { bedtimeStart: "2026-07-03T23:30:00+02:00", durationMin: 450 },
        NOW,
      ),
    ).toThrow("not both");
  });
});
