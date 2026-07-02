import { describe, expect, it } from "vitest";

import { round05, round1 } from "./round";

describe("round1", () => {
  it("rounds to 1 decimal place", () => {
    expect(round1(12.34)).toBe(12.3);
    expect(round1(12.35)).toBe(12.4);
    expect(round1(161.7)).toBe(161.7);
  });

  it("rounds a half up", () => {
    expect(round1(0.05)).toBe(0.1);
    expect(round1(2.25)).toBe(2.3);
  });
});

describe("round05", () => {
  it("rounds to the nearest 0.5 kg", () => {
    expect(round05(61.3)).toBe(61.5);
    expect(round05(80.1)).toBe(80);
    expect(round05(1.25)).toBe(1.5);
  });

  it("rounds a negative toward positive infinity (Math.round semantics)", () => {
    expect(round05(-1.2)).toBe(-1);
  });
});
