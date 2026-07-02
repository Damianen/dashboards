import { describe, expect, it } from "vitest";

import { waterSettingsSchema } from "./settings";

describe("waterSettingsSchema", () => {
  it("coerces form strings", () => {
    expect(
      waterSettingsSchema.parse({ baseTargetMl: "3000", mlPerMgStimulant: "1.5" }),
    ).toEqual({ baseTargetMl: 3000, mlPerMgStimulant: 1.5 });
  });

  it("accepts 0 ml/mg (disables the stimulant adjustment)", () => {
    expect(
      waterSettingsSchema.safeParse({ baseTargetMl: 2500, mlPerMgStimulant: 0 })
        .success,
    ).toBe(true);
  });

  it("bounds the base target to 500–6000 ml, integer", () => {
    const perMg = { mlPerMgStimulant: 1 };
    expect(waterSettingsSchema.safeParse({ baseTargetMl: 499, ...perMg }).success).toBe(false);
    expect(waterSettingsSchema.safeParse({ baseTargetMl: 6001, ...perMg }).success).toBe(false);
    expect(waterSettingsSchema.safeParse({ baseTargetMl: 2500.5, ...perMg }).success).toBe(false);
  });

  it("bounds the stimulant factor to 0–5", () => {
    const base = { baseTargetMl: 2500 };
    expect(waterSettingsSchema.safeParse({ ...base, mlPerMgStimulant: -0.1 }).success).toBe(false);
    expect(waterSettingsSchema.safeParse({ ...base, mlPerMgStimulant: 5.1 }).success).toBe(false);
  });

  it("is strict — unknown keys are rejected", () => {
    expect(
      waterSettingsSchema.safeParse({
        baseTargetMl: 2500,
        mlPerMgStimulant: 1,
        targetMl: 3000,
      }).success,
    ).toBe(false);
  });
});
