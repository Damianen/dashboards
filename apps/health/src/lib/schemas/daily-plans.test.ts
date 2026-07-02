import { describe, expect, it } from "vitest";

import {
  applyDailyPlanSchema,
  archiveDailyPlanSchema,
  createDailyPlanSchema,
  dailyPlanItemSchema,
} from "./daily-plans";

const CUID = "cflx0a1b2c3d4e5f6g7h8i9j";

describe("dailyPlanItemSchema sources", () => {
  it("accepts a barcode with quantityG", () => {
    expect(
      dailyPlanItemSchema.safeParse({ barcode: "5449000000996", quantityG: 100 })
        .success,
    ).toBe(true);
  });

  it("accepts a customFoodId with quantityG", () => {
    expect(
      dailyPlanItemSchema.safeParse({ customFoodId: CUID, quantityG: 80 })
        .success,
    ).toBe(true);
  });

  it("accepts a mealId with portions and an optional slot", () => {
    expect(
      dailyPlanItemSchema.safeParse({
        mealId: CUID,
        portions: 1.5,
        mealSlot: "DINNER",
      }).success,
    ).toBe(true);
  });

  it("rejects zero sources", () => {
    expect(dailyPlanItemSchema.safeParse({ quantityG: 100 }).success).toBe(false);
  });

  it("rejects two sources at once", () => {
    expect(
      dailyPlanItemSchema.safeParse({
        barcode: "5449000000996",
        mealId: CUID,
        quantityG: 100,
      }).success,
    ).toBe(false);
  });

  it("rejects a barcode/customFood item without quantityG", () => {
    expect(
      dailyPlanItemSchema.safeParse({ barcode: "5449000000996" }).success,
    ).toBe(false);
    expect(dailyPlanItemSchema.safeParse({ customFoodId: CUID }).success).toBe(
      false,
    );
  });

  it("rejects a meal item without portions", () => {
    expect(dailyPlanItemSchema.safeParse({ mealId: CUID }).success).toBe(false);
  });

  it("rejects non-positive amounts", () => {
    expect(
      dailyPlanItemSchema.safeParse({ barcode: "5449000000996", quantityG: 0 })
        .success,
    ).toBe(false);
    expect(
      dailyPlanItemSchema.safeParse({ mealId: CUID, portions: 0 }).success,
    ).toBe(false);
  });
});

describe("createDailyPlanSchema", () => {
  const item = { barcode: "5449000000996", quantityG: 100 };

  it("accepts a name and at least one item, trimming the name", () => {
    const r = createDailyPlanSchema.parse({ name: "  Workday  ", items: [item] });
    expect(r.name).toBe("Workday");
    expect(r.items).toHaveLength(1);
  });

  it("rejects an empty name or no items", () => {
    expect(
      createDailyPlanSchema.safeParse({ name: "", items: [item] }).success,
    ).toBe(false);
    expect(
      createDailyPlanSchema.safeParse({ name: "Workday", items: [] }).success,
    ).toBe(false);
  });

  it("rejects unknown keys (strict)", () => {
    expect(
      createDailyPlanSchema.safeParse({ name: "X", items: [item], bogus: 1 })
        .success,
    ).toBe(false);
  });
});

describe("applyDailyPlanSchema", () => {
  it("accepts a cuid id with no day (defaults applied at the call site)", () => {
    const r = applyDailyPlanSchema.safeParse({ dailyPlanId: CUID });
    expect(r.success).toBe(true);
  });

  it("accepts a valid YYYY-MM-DD day", () => {
    expect(
      applyDailyPlanSchema.safeParse({ dailyPlanId: CUID, day: "2026-06-25" })
        .success,
    ).toBe(true);
  });

  it("rejects a malformed day and a non-cuid id", () => {
    expect(
      applyDailyPlanSchema.safeParse({ dailyPlanId: CUID, day: "25-06-2026" })
        .success,
    ).toBe(false);
    expect(
      applyDailyPlanSchema.safeParse({ dailyPlanId: "nope" }).success,
    ).toBe(false);
  });
});

describe("archiveDailyPlanSchema", () => {
  it("defaults a bare body to archive (back-compat with the old route)", () => {
    expect(archiveDailyPlanSchema.parse({})).toEqual({ archived: true });
  });

  it("accepts an explicit restore", () => {
    expect(archiveDailyPlanSchema.parse({ archived: false })).toEqual({
      archived: false,
    });
  });

  it("is strict and boolean-only", () => {
    expect(archiveDailyPlanSchema.safeParse({ archived: 1 }).success).toBe(false);
    expect(
      archiveDailyPlanSchema.safeParse({ archived: true, x: 1 }).success,
    ).toBe(false);
  });
});
