import { describe, expect, it } from "vitest";
import {
  computeWaterTarget,
  type Macros,
  scaleMacros,
  shouldReuseSession,
} from "./rules";

describe("computeWaterTarget", () => {
  it("returns the base when there are no stimulants", () => {
    expect(computeWaterTarget(2500, 1, 0)).toBe(2500);
  });

  it("adds mlPerMg for each stimulant mg", () => {
    expect(computeWaterTarget(2500, 1, 200)).toBe(2700);
  });

  it("scales the bump by mlPerMg", () => {
    expect(computeWaterTarget(2500, 0.5, 200)).toBe(2600);
  });
});

describe("shouldReuseSession", () => {
  const now = new Date("2026-06-16T12:00:00.000Z");

  it("reuses a session started 2h59m ago", () => {
    const started = new Date(now.getTime() - (2 * 60 + 59) * 60 * 1000);
    expect(shouldReuseSession(started, now)).toBe(true);
  });

  it("does not reuse a session started 3h01m ago", () => {
    const started = new Date(now.getTime() - (3 * 60 + 1) * 60 * 1000);
    expect(shouldReuseSession(started, now)).toBe(false);
  });

  it("does not reuse when there is no prior session", () => {
    expect(shouldReuseSession(null, now)).toBe(false);
  });
});

describe("scaleMacros", () => {
  // Per-100g macros roughly modelled on Nutella (no fiber reported → null).
  const per100g: Macros = {
    kcal: 539,
    proteinG: 6.3,
    carbG: 57.5,
    fatG: 30.9,
    fiberG: null,
    sugarG: 56.3,
    saltG: 0.1,
  };

  it("returns the per-100g values unchanged for a 100 g portion", () => {
    expect(scaleMacros(per100g, 100)).toEqual(per100g);
  });

  it("scales each non-null field and rounds to 1 decimal", () => {
    const scaled = scaleMacros(per100g, 30);
    expect(scaled.kcal).toBe(161.7); // 539 * 0.3
    expect(scaled.proteinG).toBe(1.9); // 1.89 → 1.9
    expect(scaled.carbG).toBe(17.3); // 17.25 → 17.3
    expect(scaled.fatG).toBe(9.3); // 9.27 → 9.3
    expect(scaled.sugarG).toBe(16.9); // 16.89 → 16.9
    expect(scaled.saltG).toBe(0); // 0.03 → 0.0
  });

  it("keeps unreported nutrients null instead of computing 0", () => {
    expect(scaleMacros(per100g, 30).fiberG).toBe(null);
    expect(scaleMacros(per100g, 250).fiberG).toBe(null);
  });

  it("handles fractional gram quantities", () => {
    expect(scaleMacros({ ...per100g, kcal: 200 }, 12.5).kcal).toBe(25);
  });

  it("leaves an all-null set entirely null", () => {
    const empty: Macros = {
      kcal: null,
      proteinG: null,
      carbG: null,
      fatG: null,
      fiberG: null,
      sugarG: null,
      saltG: null,
    };
    expect(scaleMacros(empty, 250)).toEqual(empty);
  });
});
