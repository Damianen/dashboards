import { describe, expect, it } from "vitest";

import {
  briefingModeSchema,
  briefingSettingsSchema,
  rotationSchema,
} from "./briefing";

// Any "c"-prefixed, dash/space-free string ≥ 9 chars is a valid cuid for zod.
const CUID_A = "clu0abc123def456ghi789jkl";
const CUID_B = "clu0zzz999yyy888xxx777www";

describe("briefingModeSchema", () => {
  it("accepts the two modes", () => {
    expect(briefingModeSchema.parse("morning")).toBe("morning");
    expect(briefingModeSchema.parse("evening")).toBe("evening");
  });

  it("rejects anything else", () => {
    expect(briefingModeSchema.safeParse("noon").success).toBe(false);
  });
});

describe("rotationSchema", () => {
  it("accepts templates and rest slots in order", () => {
    const parsed = rotationSchema.parse({
      entries: [
        { kind: "TEMPLATE", templateId: CUID_A },
        { kind: "REST" },
        { kind: "TEMPLATE", templateId: CUID_B },
      ],
    });
    expect(parsed.entries).toHaveLength(3);
  });

  it("accepts an empty rotation (= not configured)", () => {
    expect(rotationSchema.parse({ entries: [] }).entries).toEqual([]);
  });

  it("rejects a TEMPLATE entry without a templateId", () => {
    expect(
      rotationSchema.safeParse({ entries: [{ kind: "TEMPLATE" }] }).success,
    ).toBe(false);
  });

  it("rejects a REST entry carrying a templateId (strict)", () => {
    expect(
      rotationSchema.safeParse({
        entries: [{ kind: "REST", templateId: CUID_A }],
      }).success,
    ).toBe(false);
  });

  it("rejects an unknown kind", () => {
    expect(
      rotationSchema.safeParse({ entries: [{ kind: "CARDIO" }] }).success,
    ).toBe(false);
  });

  it("rejects a malformed templateId", () => {
    expect(
      rotationSchema.safeParse({
        entries: [{ kind: "TEMPLATE", templateId: "not-a-cuid" }],
      }).success,
    ).toBe(false);
  });

  it("rejects more than 14 entries", () => {
    const entries = Array.from({ length: 15 }, () => ({ kind: "REST" }));
    expect(rotationSchema.safeParse({ entries }).success).toBe(false);
  });
});

const VALID_SETTINGS = {
  morning: { enabled: true, time: "07:30" },
  evening: { enabled: true, time: "21:00" },
  modeCutoffHour: 15,
  thresholds: { goodMin: 75, moderateMin: 60 },
};

describe("briefingSettingsSchema", () => {
  it("accepts the default shape", () => {
    expect(briefingSettingsSchema.parse(VALID_SETTINGS)).toEqual(VALID_SETTINGS);
  });

  it("coerces form strings for the numeric fields", () => {
    const parsed = briefingSettingsSchema.parse({
      ...VALID_SETTINGS,
      modeCutoffHour: "15",
      thresholds: { goodMin: "75", moderateMin: "60" },
    });
    expect(parsed.modeCutoffHour).toBe(15);
    expect(parsed.thresholds).toEqual({ goodMin: 75, moderateMin: 60 });
  });

  it.each(["7:30", "24:00", "07:60", "0730", "07-30"])(
    "rejects malformed slot time %s",
    (time) => {
      expect(
        briefingSettingsSchema.safeParse({
          ...VALID_SETTINGS,
          morning: { enabled: true, time },
        }).success,
      ).toBe(false);
    },
  );

  it("accepts the edges of the time range", () => {
    const parsed = briefingSettingsSchema.parse({
      ...VALID_SETTINGS,
      morning: { enabled: false, time: "00:00" },
      evening: { enabled: true, time: "23:59" },
    });
    expect(parsed.morning.time).toBe("00:00");
    expect(parsed.evening.time).toBe("23:59");
  });

  it("rejects thresholds where moderateMin is not below goodMin", () => {
    for (const thresholds of [
      { goodMin: 70, moderateMin: 70 },
      { goodMin: 60, moderateMin: 75 },
    ]) {
      expect(
        briefingSettingsSchema.safeParse({ ...VALID_SETTINGS, thresholds })
          .success,
      ).toBe(false);
    }
  });

  it("rejects an out-of-range cutoff hour", () => {
    for (const modeCutoffHour of [-1, 24]) {
      expect(
        briefingSettingsSchema.safeParse({ ...VALID_SETTINGS, modeCutoffHour })
          .success,
      ).toBe(false);
    }
  });

  it("rejects unknown keys (strict)", () => {
    expect(
      briefingSettingsSchema.safeParse({ ...VALID_SETTINGS, extra: 1 }).success,
    ).toBe(false);
  });
});
