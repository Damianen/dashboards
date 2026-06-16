import { describe, expect, it } from "vitest";
import { computeWaterTarget, shouldReuseSession } from "./rules";

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
