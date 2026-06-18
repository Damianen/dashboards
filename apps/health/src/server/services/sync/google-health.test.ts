import { describe, expect, it } from "vitest";

import { Source } from "@/generated/prisma/client";
import type { DailyActivityRow } from "@/server/integrations/google-health";
import { toDailyActivityData } from "./google-health";

function row(over: Partial<DailyActivityRow> = {}): DailyActivityRow {
  return {
    day: "2026-06-14",
    activeKcal: 512,
    totalKcal: 2311,
    steps: 8421,
    raw: { energy: { day: "2026-06-14" }, steps: { day: "2026-06-14" } },
    ...over,
  };
}

describe("toDailyActivityData", () => {
  it("maps day to a UTC-midnight Date and passes metrics through", () => {
    const d = toDailyActivityData(row());
    expect((d.day as Date).toISOString()).toBe("2026-06-14T00:00:00.000Z");
    expect(d.activeKcal).toBe(512);
    expect(d.totalKcal).toBe(2311);
    expect(d.steps).toBe(8421);
    expect(d.source).toBe(Source.GOOGLE_HEALTH);
  });

  it("coerces missing metrics to null (the columns are nullable)", () => {
    const d = toDailyActivityData(
      row({ activeKcal: undefined, totalKcal: undefined, steps: undefined }),
    );
    expect(d.activeKcal).toBeNull();
    expect(d.totalKcal).toBeNull();
    expect(d.steps).toBeNull();
  });

  it("retains the per-day raw payload", () => {
    const r = row();
    expect(toDailyActivityData(r).raw).toEqual(r.raw);
  });
});
