import { describe, expect, it } from "vitest";

import { daySchema } from "./common";

describe("daySchema", () => {
  it("accepts a canonical civil date", () => {
    expect(daySchema.parse("2026-07-03")).toBe("2026-07-03");
    expect(daySchema.safeParse("2024-02-29").success).toBe(true); // leap day
  });

  it("rejects non-YYYY-MM-DD formats", () => {
    for (const bad of [
      "2026-7-3",
      "20260703",
      "03-07-2026",
      "2026-07-03T00:00:00Z",
      "yesterday",
      "",
    ]) {
      expect(daySchema.safeParse(bad).success).toBe(false);
    }
  });

  it("rejects dates the Date parser cannot resolve (e.g. month 13)", () => {
    expect(daySchema.safeParse("2026-13-01").success).toBe(false);
    expect(daySchema.safeParse("2026-00-10").success).toBe(false);
  });

  it("documents the refine's leniency: day overflow rolls over instead of failing", () => {
    // This Node's ISO Date parsing rolls "2026-02-30" into March rather than
    // yielding Invalid Date, so the refine accepts it. Pinned so a future
    // tightening of daySchema (or a V8 behavior change) is a conscious choice.
    expect(daySchema.safeParse("2026-02-30").success).toBe(true);
    expect(daySchema.safeParse("2026-04-31").success).toBe(true);
  });
});
