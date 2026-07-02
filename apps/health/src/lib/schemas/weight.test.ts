import { describe, expect, it } from "vitest";

import { logWeightSchema } from "./weight";

describe("logWeightSchema", () => {
  it("accepts the bounds and decimals", () => {
    expect(logWeightSchema.safeParse({ weightKg: 20 }).success).toBe(true);
    expect(logWeightSchema.safeParse({ weightKg: 350 }).success).toBe(true);
    expect(logWeightSchema.safeParse({ weightKg: 82.4 }).success).toBe(true);
  });

  it("rejects out-of-band weights", () => {
    expect(logWeightSchema.safeParse({ weightKg: 19.9 }).success).toBe(false);
    expect(logWeightSchema.safeParse({ weightKg: 350.1 }).success).toBe(false);
  });

  it("accepts an offset ISO measuredAt and rejects garbage", () => {
    expect(
      logWeightSchema.safeParse({
        weightKg: 80,
        measuredAt: "2026-07-01T08:30:00+02:00",
      }).success,
    ).toBe(true);
    expect(
      logWeightSchema.safeParse({ weightKg: 80, measuredAt: "yesterday" })
        .success,
    ).toBe(false);
  });

  it("is strict — unknown keys are rejected", () => {
    expect(
      logWeightSchema.safeParse({ weightKg: 80, source: "MANUAL" }).success,
    ).toBe(false);
  });
});
