import { describe, expect, it } from "vitest";

import {
  createCustomFoodSchema,
  logFoodSchema,
  per100gSchema,
  updateFoodEntrySchema,
} from "./food";

const CUID = "cflx0a1b2c3d4e5f6g7h8i9j";

describe("per100gSchema", () => {
  it("accepts the four required macros, optional rest omitted", () => {
    const r = per100gSchema.safeParse({
      kcal: 250,
      proteinG: 10,
      carbG: 30,
      fatG: 8,
    });
    expect(r.success).toBe(true);
  });

  it("requires kcal/protein/carb/fat", () => {
    expect(per100gSchema.safeParse({ kcal: 1, proteinG: 1, carbG: 1 }).success).toBe(
      false,
    );
  });

  it("rejects negative macros", () => {
    expect(
      per100gSchema.safeParse({ kcal: -1, proteinG: 0, carbG: 0, fatG: 0 })
        .success,
    ).toBe(false);
  });

  it("rejects unknown keys (strict)", () => {
    expect(
      per100gSchema.safeParse({
        kcal: 1,
        proteinG: 1,
        carbG: 1,
        fatG: 1,
        bogus: 1,
      }).success,
    ).toBe(false);
  });

  it("rejects per-100g values that could overflow a snapshot column", () => {
    const base = { kcal: 1, proteinG: 1, carbG: 1, fatG: 1 };
    expect(per100gSchema.safeParse({ ...base, kcal: 9001 }).success).toBe(false);
    expect(per100gSchema.safeParse({ ...base, proteinG: 1001 }).success).toBe(false);
    expect(per100gSchema.safeParse({ ...base, saltG: 101 }).success).toBe(false);
    expect(per100gSchema.safeParse({ ...base, caffeineMg: 20000 }).success).toBe(
      false,
    );
  });

  it("guarantees max-bound values scaled by the max quantity fit the Decimal columns", () => {
    // logFood snapshots per100g × quantityG/100; quantityG caps at 5000 (factor 50).
    // Each schema max × 50 must fit its FoodEntry column, or a valid input could
    // 500 at log time instead of 400ing at parse time.
    const factor = 5000 / 100;
    expect(9000 * factor).toBeLessThanOrEqual(999999.9); // kcal Decimal(7,1)
    expect(1000 * factor).toBeLessThanOrEqual(99999.9); // gram macros Decimal(6,1)
    expect(100 * factor).toBeLessThanOrEqual(9999.99); // saltG Decimal(6,2)
    expect(19999.9 * factor).toBeLessThanOrEqual(999999.9); // caffeineMg Decimal(7,1)
  });
});

describe("createCustomFoodSchema", () => {
  const base = {
    name: "Granny's oats",
    per100g: { kcal: 380, proteinG: 13, carbG: 60, fatG: 7 },
  };

  it("defaults source to MANUAL", () => {
    const r = createCustomFoodSchema.parse(base);
    expect(r.source).toBe("MANUAL");
  });

  it("accepts an explicit LABEL_SCAN source and a serving", () => {
    const r = createCustomFoodSchema.parse({
      ...base,
      brand: "Quaker",
      servingG: 40,
      source: "LABEL_SCAN",
    });
    expect(r.source).toBe("LABEL_SCAN");
    expect(r.servingG).toBe(40);
  });

  it("rejects an unknown source", () => {
    expect(
      createCustomFoodSchema.safeParse({ ...base, source: "ESTIMATE" }).success,
    ).toBe(false);
  });

  it("rejects an empty name and a non-positive serving", () => {
    expect(createCustomFoodSchema.safeParse({ ...base, name: "" }).success).toBe(
      false,
    );
    expect(
      createCustomFoodSchema.safeParse({ ...base, servingG: 0 }).success,
    ).toBe(false);
  });
});

describe("logFoodSchema sources", () => {
  it("accepts a barcode alone (no kcal needed)", () => {
    expect(
      logFoodSchema.safeParse({ barcode: "5449000000996", quantityG: 100 })
        .success,
    ).toBe(true);
  });

  it("accepts a customFoodId alone (no kcal needed)", () => {
    expect(
      logFoodSchema.safeParse({ customFoodId: CUID, quantityG: 100 }).success,
    ).toBe(true);
  });

  it("accepts customName WITH kcal", () => {
    expect(
      logFoodSchema.safeParse({
        customName: "Soup",
        quantityG: 250,
        kcal: 120,
      }).success,
    ).toBe(true);
  });

  it("rejects customName WITHOUT kcal", () => {
    expect(
      logFoodSchema.safeParse({ customName: "Soup", quantityG: 250 }).success,
    ).toBe(false);
  });

  it("rejects zero sources", () => {
    expect(logFoodSchema.safeParse({ quantityG: 100 }).success).toBe(false);
  });

  it("rejects two sources at once", () => {
    expect(
      logFoodSchema.safeParse({
        barcode: "5449000000996",
        customFoodId: CUID,
        quantityG: 100,
      }).success,
    ).toBe(false);
    expect(
      logFoodSchema.safeParse({
        customFoodId: CUID,
        customName: "Soup",
        kcal: 1,
        quantityG: 100,
      }).success,
    ).toBe(false);
  });

  it("rejects a non-cuid customFoodId", () => {
    expect(
      logFoodSchema.safeParse({ customFoodId: "nope", quantityG: 100 }).success,
    ).toBe(false);
  });

  it("caps the salt override at its tighter Decimal(6,2) column, not the shared macro max", () => {
    const base = { barcode: "5449000000996", quantityG: 100 };
    expect(logFoodSchema.safeParse({ ...base, saltG: 9999.99 }).success).toBe(true);
    expect(logFoodSchema.safeParse({ ...base, saltG: 10000 }).success).toBe(false);
    // The other overrides keep the wider Decimal(7,1)/(6,1)-derived cap.
    expect(logFoodSchema.safeParse({ ...base, kcal: 99999.9 }).success).toBe(true);
  });
});

describe("updateFoodEntrySchema", () => {
  it("rejects an empty patch (at least one field required)", () => {
    expect(updateFoodEntrySchema.safeParse({}).success).toBe(false);
  });

  it("accepts each field alone", () => {
    expect(updateFoodEntrySchema.safeParse({ quantityG: 250 }).success).toBe(true);
    expect(updateFoodEntrySchema.safeParse({ meal: "DINNER" }).success).toBe(true);
    expect(updateFoodEntrySchema.safeParse({ notes: "less oil" }).success).toBe(true);
  });

  it("accepts explicit nulls for meal and notes (clear semantics)", () => {
    expect(updateFoodEntrySchema.safeParse({ meal: null }).success).toBe(true);
    expect(updateFoodEntrySchema.safeParse({ notes: null }).success).toBe(true);
  });

  it("bounds quantityG like logFoodSchema (0 < q ≤ 5000)", () => {
    expect(updateFoodEntrySchema.safeParse({ quantityG: 0 }).success).toBe(false);
    expect(updateFoodEntrySchema.safeParse({ quantityG: 5001 }).success).toBe(false);
    expect(updateFoodEntrySchema.safeParse({ quantityG: 5000 }).success).toBe(true);
  });

  it("is strict — unknown keys are rejected", () => {
    expect(
      updateFoodEntrySchema.safeParse({ quantityG: 100, kcal: 500 }).success,
    ).toBe(false);
  });

  it("rejects an empty-string note (trim + min 1 — null is the clear signal)", () => {
    expect(updateFoodEntrySchema.safeParse({ notes: "  " }).success).toBe(false);
  });
});
