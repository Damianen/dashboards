import { describe, expect, it } from "vitest";

import { createMealSchema, logMealSchema, mealItemSchema } from "./meals";

const CUID = "cflx0a1b2c3d4e5f6g7h8i9j";
const BARCODE = "5449000000996";

describe("mealItemSchema exactly-one-source rule", () => {
  it("rejects zero sources", () => {
    expect(mealItemSchema.safeParse({ quantityG: 100 }).success).toBe(false);
  });

  it("rejects two sources at once", () => {
    expect(
      mealItemSchema.safeParse({
        barcode: BARCODE,
        customFoodId: CUID,
        quantityG: 100,
      }).success,
    ).toBe(false);
    expect(
      mealItemSchema.safeParse({
        customName: "Soup",
        kcal: 100,
        childMealId: CUID,
        childPortions: 1,
      }).success,
    ).toBe(false);
  });

  it("accepts a barcode with quantityG", () => {
    expect(
      mealItemSchema.safeParse({ barcode: BARCODE, quantityG: 100 }).success,
    ).toBe(true);
  });

  it("accepts a customFoodId with quantityG", () => {
    expect(
      mealItemSchema.safeParse({ customFoodId: CUID, quantityG: 40 }).success,
    ).toBe(true);
  });

  it("accepts a customName with kcal (no quantityG needed)", () => {
    expect(
      mealItemSchema.safeParse({ customName: "Broth", kcal: 30 }).success,
    ).toBe(true);
  });

  it("accepts a childMealId with childPortions", () => {
    expect(
      mealItemSchema.safeParse({ childMealId: CUID, childPortions: 0.5 })
        .success,
    ).toBe(true);
  });
});

describe("mealItemSchema per-source companions", () => {
  it("rejects a barcode without quantityG", () => {
    expect(mealItemSchema.safeParse({ barcode: BARCODE }).success).toBe(false);
  });

  it("rejects a customFoodId without quantityG", () => {
    expect(mealItemSchema.safeParse({ customFoodId: CUID }).success).toBe(
      false,
    );
  });

  it("rejects a customName without kcal (other macros do not substitute)", () => {
    expect(
      mealItemSchema.safeParse({ customName: "Broth", proteinG: 5 }).success,
    ).toBe(false);
  });

  it("rejects a childMealId without childPortions", () => {
    expect(mealItemSchema.safeParse({ childMealId: CUID }).success).toBe(
      false,
    );
  });
});

describe("mealItemSchema shape", () => {
  it("rejects unknown keys (strictObject)", () => {
    expect(
      mealItemSchema.safeParse({
        barcode: BARCODE,
        quantityG: 100,
        bogus: 1,
      }).success,
    ).toBe(false);
  });
});

describe("createMealSchema", () => {
  const item = { barcode: BARCODE, quantityG: 100 };
  const base = { name: "Overnight oats", yieldPortions: 4, items: [item] };

  it("accepts a valid meal", () => {
    expect(createMealSchema.safeParse(base).success).toBe(true);
  });

  it("rejects yieldPortions of 0 (gt, not gte)", () => {
    expect(
      createMealSchema.safeParse({ ...base, yieldPortions: 0 }).success,
    ).toBe(false);
  });

  it("caps yieldPortions at 9999.99", () => {
    expect(
      createMealSchema.safeParse({ ...base, yieldPortions: 9999.99 }).success,
    ).toBe(true);
    expect(
      createMealSchema.safeParse({ ...base, yieldPortions: 10000 }).success,
    ).toBe(false);
  });

  it("requires at least one item", () => {
    expect(createMealSchema.safeParse({ ...base, items: [] }).success).toBe(
      false,
    );
  });
});

describe("logMealSchema", () => {
  const base = { mealId: CUID, portions: 1 };

  it("accepts a bare mealId + portions", () => {
    expect(logMealSchema.safeParse(base).success).toBe(true);
  });

  it("rejects zero and over-cap portions", () => {
    expect(logMealSchema.safeParse({ ...base, portions: 0 }).success).toBe(
      false,
    );
    expect(logMealSchema.safeParse({ ...base, portions: 10000 }).success).toBe(
      false,
    );
  });

  it("accepts diary meal slots and rejects BRUNCH", () => {
    expect(logMealSchema.safeParse({ ...base, meal: "LUNCH" }).success).toBe(
      true,
    );
    expect(logMealSchema.safeParse({ ...base, meal: "BRUNCH" }).success).toBe(
      false,
    );
  });

  it("accepts an offset ISO datetime for eatenAt", () => {
    expect(
      logMealSchema.safeParse({
        ...base,
        eatenAt: "2026-07-02T12:30:00+02:00",
      }).success,
    ).toBe(true);
  });

  it("rejects a bare date for eatenAt", () => {
    expect(
      logMealSchema.safeParse({ ...base, eatenAt: "2026-07-02" }).success,
    ).toBe(false);
  });
});
