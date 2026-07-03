import { describe, expect, it } from "vitest";

import type { CustomFoodDTO, FoodProductDTO } from "./food";
import {
  type BuilderItem,
  builderItemFromPicked,
  builderItemFromView,
  builderSnapshot,
  builderTotals,
  itemContribution,
  toCreateMealInput,
  toMealItemInput,
} from "./meal-builder";
import type { Macros } from "./rules";
import type { MealItemView, MealSummary } from "@/server/services/meals";

const CUID = "cflx0a1b2c3d4e5f6g7h8i9j";

// A Macros with everything null by default; override only the fields a test cares about.
function macros(p: Partial<Macros>): Macros {
  return {
    kcal: null,
    proteinG: null,
    carbG: null,
    fatG: null,
    fiberG: null,
    sugarG: null,
    saltG: null,
    caffeineMg: null,
    ...p,
  };
}

// A saved MealItemView with every source column null; override the one a test sets.
function view(p: Partial<MealItemView>): MealItemView {
  return {
    id: "i1",
    position: 0,
    productBarcode: null,
    customFoodId: null,
    customName: null,
    childMealId: null,
    quantityG: null,
    childPortions: null,
    macros: macros({}),
    displayName: "Item",
    ...p,
  };
}

const productItem: BuilderItem = {
  key: "a",
  name: "Coke",
  amount: 50,
  source: {
    kind: "product",
    barcode: "5449000000996",
    per100g: macros({ kcal: 200, proteinG: 6.3 }),
  },
};

const childMealItem: BuilderItem = {
  key: "b",
  name: "Shake",
  amount: 2,
  source: {
    kind: "childMeal",
    childMealId: CUID,
    perPortion: macros({ kcal: 300, proteinG: 30 }),
  },
};

const freeItem: BuilderItem = {
  key: "c",
  name: "Cheat meal",
  amount: 250,
  source: { kind: "free", macros: macros({ kcal: 250, proteinG: 20.5 }) },
};

describe("itemContribution", () => {
  it("scales a product per-100 g by its gram amount (1 dp)", () => {
    const c = itemContribution(productItem);
    expect(c.kcal).toBe(100); // 200 * 50/100
    expect(c.proteinG).toBe(3.2); // 6.3 * 0.5 = 3.15 → 3.2
  });

  it("scales a custom food per-100 g by its gram amount", () => {
    const item: BuilderItem = {
      key: "d",
      name: "Oats",
      amount: 80,
      source: {
        kind: "customFood",
        customFoodId: CUID,
        per100g: macros({ kcal: 380, proteinG: 13.5 }),
      },
    };
    const c = itemContribution(item);
    expect(c.kcal).toBe(304); // 380 * 0.8
    expect(c.proteinG).toBe(10.8); // 13.5 * 0.8
  });

  it("returns a free item's entered macros verbatim — the amount never scales them", () => {
    expect(itemContribution(freeItem)).toEqual(
      macros({ kcal: 250, proteinG: 20.5 }),
    );
    expect(itemContribution({ ...freeItem, amount: 0 })).toEqual(
      macros({ kcal: 250, proteinG: 20.5 }),
    );
  });

  it("scales a nested meal per-portion by its portion count", () => {
    const c = itemContribution(childMealItem);
    expect(c.kcal).toBe(600); // 300 * 2
    expect(c.proteinG).toBe(60);
  });

  it("preserves null macro fields through scaling", () => {
    expect(itemContribution(productItem).fatG).toBeNull();
    expect(itemContribution(productItem).caffeineMg).toBeNull();
    expect(itemContribution(childMealItem).carbG).toBeNull();
  });
});

describe("builderTotals", () => {
  it("computes the null-aware total and the per-portion at the given yield", () => {
    const { total, perPortion } = builderTotals(
      [productItem, childMealItem, freeItem],
      4,
    );
    expect(total.kcal).toBe(950); // 100 + 600 + 250
    expect(total.proteinG).toBe(83.7); // 3.2 + 60 + 20.5
    expect(total.fatG).toBeNull(); // unknown in every item
    expect(perPortion.kcal).toBe(237.5); // 950 / 4
    expect(perPortion.proteinG).toBe(20.9); // 83.7 / 4 = 20.925 → 20.9
    expect(perPortion.fatG).toBeNull();
  });

  it("rounds the per-portion to 1 dp", () => {
    const { perPortion } = builderTotals([freeItem], 4);
    expect(perPortion.kcal).toBe(62.5); // 250 / 4
    expect(perPortion.proteinG).toBe(5.1); // 20.5 / 4 = 5.125 → 5.1
  });

  it("treats yieldPortions 0 as 1 instead of throwing (perPortion = total)", () => {
    const { total, perPortion } = builderTotals([freeItem], 0);
    expect(total.kcal).toBe(250);
    expect(perPortion).toEqual(total);
  });

  it("treats a negative yield as 1 too", () => {
    const { total, perPortion } = builderTotals([productItem], -2);
    expect(perPortion).toEqual(total);
  });
});

describe("builderItemFromView (edit-mode round-trip)", () => {
  it("reconstructs a product item, back-deriving per-100 g from the snapshot", () => {
    const item = builderItemFromView(
      view({
        productBarcode: "5449000000996",
        quantityG: 200,
        macros: macros({ kcal: 300, proteinG: 12 }),
        displayName: "Coke",
      }),
    );
    expect(item.amount).toBe(200);
    expect(item.source).toEqual({
      kind: "product",
      barcode: "5449000000996",
      per100g: macros({ kcal: 150, proteinG: 6 }), // snapshot × 100/200
    });
    // Re-scaling the derived per-100 g by the amount returns the snapshot.
    expect(itemContribution(item)).toEqual(macros({ kcal: 300, proteinG: 12 }));
    expect(toMealItemInput(item)).toEqual({
      barcode: "5449000000996",
      quantityG: 200,
    });
  });

  it("reconstructs a custom-food item by grams", () => {
    const item = builderItemFromView(
      view({
        customFoodId: CUID,
        quantityG: 80,
        macros: macros({ kcal: 304 }),
        displayName: "Oats",
      }),
    );
    expect(item.amount).toBe(80);
    expect(item.source).toEqual({
      kind: "customFood",
      customFoodId: CUID,
      per100g: macros({ kcal: 380 }), // 304 × 100/80
    });
    expect(itemContribution(item).kcal).toBe(304);
    expect(toMealItemInput(item)).toEqual({ customFoodId: CUID, quantityG: 80 });
  });

  it("reconstructs a nested-meal item, back-deriving per-portion via 1/childPortions", () => {
    const item = builderItemFromView(
      view({
        childMealId: CUID,
        childPortions: 2,
        macros: macros({ kcal: 600, proteinG: 61 }),
        displayName: "Shake",
      }),
    );
    expect(item.amount).toBe(2);
    expect(item.source).toEqual({
      kind: "childMeal",
      childMealId: CUID,
      perPortion: macros({ kcal: 300, proteinG: 30.5 }), // snapshot × 1/2
    });
    expect(itemContribution(item)).toEqual(macros({ kcal: 600, proteinG: 61 }));
    expect(toMealItemInput(item)).toEqual({ childMealId: CUID, childPortions: 2 });
  });

  it("reconstructs a free item, carrying the snapshot and mapping a null quantity to 0", () => {
    const item = builderItemFromView(
      view({
        customName: "Cheat meal",
        quantityG: null,
        macros: macros({ kcal: 420, proteinG: 25 }),
        displayName: "Cheat meal",
      }),
    );
    expect(item.amount).toBe(0);
    expect(item.source).toEqual({
      kind: "free",
      macros: macros({ kcal: 420, proteinG: 25 }),
    });
    expect(itemContribution(item)).toEqual(macros({ kcal: 420, proteinG: 25 }));
  });
});

// Picker DTO fixtures for builderItemFromPicked. The per100g/perPortion partial
// casts mirror the wire, where detail macros a source never reported are absent
// (undefined) — exactly what coerceMacros exists to normalize.
const pickedProduct: FoodProductDTO = {
  barcode: "5449000000996",
  name: "Coke",
  brand: "Coca-Cola",
  imageUrl: null,
  per100g: macros({ kcal: 42, sugarG: 10.6 }),
  servingG: "330",
};

const pickedFood: CustomFoodDTO = {
  id: CUID,
  name: "Oats",
  brand: null,
  per100g: { kcal: 380, proteinG: 13.5 } as Macros,
  servingG: 40,
  source: "manual",
  archived: false,
  lastUsedAt: null,
};

const pickedMeal: MealSummary = {
  id: CUID,
  name: "Shake",
  notes: null,
  yieldPortions: 2,
  perPortion: { kcal: 300, proteinG: 30 } as Macros,
  perPortionKcal: 300,
  archived: false,
  createdAt: "2026-06-16T08:00:00.000Z",
  updatedAt: "2026-06-16T08:00:00.000Z",
};

describe("builderItemFromPicked", () => {
  it("starts a product at its serving size (wire string), per-100 g verbatim", () => {
    const item = builderItemFromPicked({ kind: "product", product: pickedProduct });
    expect(item.name).toBe("Coke");
    expect(item.amount).toBe(330);
    expect(item.source).toEqual({
      kind: "product",
      barcode: "5449000000996",
      per100g: macros({ kcal: 42, sugarG: 10.6 }),
    });
  });

  it("defaults a product without a serving size to 100 g", () => {
    const item = builderItemFromPicked({
      kind: "product",
      product: { ...pickedProduct, servingG: null },
    });
    expect(item.amount).toBe(100);
  });

  it("starts a saved food at its serving size, coercing partial per-100 g to full Macros", () => {
    const item = builderItemFromPicked({ kind: "customFood", food: pickedFood });
    expect(item.name).toBe("Oats");
    expect(item.amount).toBe(40);
    expect(item.source).toEqual({
      kind: "customFood",
      customFoodId: CUID,
      per100g: macros({ kcal: 380, proteinG: 13.5 }), // absent fields → null
    });
  });

  it("starts a picked meal at 1 portion as a coerced childMeal source", () => {
    const item = builderItemFromPicked({ kind: "meal", meal: pickedMeal });
    expect(item.name).toBe("Shake");
    expect(item.amount).toBe(1);
    expect(item.source).toEqual({
      kind: "childMeal",
      childMealId: CUID,
      perPortion: macros({ kcal: 300, proteinG: 30 }),
    });
  });

  it("carries a manual item's entered macros as a free source with amount 0", () => {
    const item = builderItemFromPicked({
      kind: "manual",
      name: "Olive oil, 1 tbsp",
      macros: macros({ kcal: 119, fatG: 13.5 }),
    });
    expect(item.name).toBe("Olive oil, 1 tbsp");
    expect(item.amount).toBe(0);
    expect(item.source).toEqual({
      kind: "free",
      macros: macros({ kcal: 119, fatG: 13.5 }),
    });
  });

  it("mints a distinct list key per conversion", () => {
    const a = builderItemFromPicked({ kind: "product", product: pickedProduct });
    const b = builderItemFromPicked({ kind: "product", product: pickedProduct });
    expect(a.key).not.toBe(b.key);
  });
});

describe("toMealItemInput", () => {
  it("serializes product and child-meal items by their amounts", () => {
    expect(toMealItemInput(productItem)).toEqual({
      barcode: "5449000000996",
      quantityG: 50,
    });
    expect(toMealItemInput(childMealItem)).toEqual({
      childMealId: CUID,
      childPortions: 2,
    });
  });

  it("strips null macros from a free item and coalesces a null kcal to 0", () => {
    const item: BuilderItem = {
      key: "e",
      name: "Mystery snack",
      amount: 0,
      source: { kind: "free", macros: macros({ proteinG: 10 }) },
    };
    expect(toMealItemInput(item)).toEqual({
      customName: "Mystery snack",
      kcal: 0, // null kcal → 0 (the schema requires kcal on free items)
      proteinG: 10, // present → kept; every null macro omitted
    });
  });

  it("includes a free item's quantityG only when the amount is positive", () => {
    expect(toMealItemInput(freeItem)).toEqual({
      customName: "Cheat meal",
      quantityG: 250,
      kcal: 250,
      proteinG: 20.5,
    });
    expect("quantityG" in toMealItemInput({ ...freeItem, amount: 0 })).toBe(
      false,
    );
  });
});

describe("toCreateMealInput", () => {
  it("trims the name and omits blank notes", () => {
    const input = toCreateMealInput("  Bulk pasta  ", 4, "   ", [productItem]);
    expect(input.name).toBe("Bulk pasta");
    expect("notes" in input).toBe(false);
    expect(input.yieldPortions).toBe(4);
    expect(input.items).toEqual([
      { barcode: "5449000000996", quantityG: 50 },
    ]);
  });

  it("keeps trimmed notes when present", () => {
    const input = toCreateMealInput("Shake", 1, "  freeze half  ", [
      childMealItem,
    ]);
    expect(input.notes).toBe("freeze half");
    expect(input.items).toEqual([{ childMealId: CUID, childPortions: 2 }]);
  });
});

describe("builderSnapshot (dirty detection)", () => {
  it("ignores react keys, so an initial reminted per render compares equal", () => {
    const reminted = { ...productItem, key: "totally-different-key" };
    expect(builderSnapshot([reminted])).toBe(builderSnapshot([productItem]));
  });

  it("differs when an amount changes", () => {
    expect(builderSnapshot([{ ...productItem, amount: 60 }])).not.toBe(
      builderSnapshot([productItem]),
    );
  });

  it("differs when an item is added, removed, or reordered", () => {
    expect(builderSnapshot([productItem, childMealItem])).not.toBe(
      builderSnapshot([productItem]),
    );
    expect(builderSnapshot([childMealItem, productItem])).not.toBe(
      builderSnapshot([productItem, childMealItem]),
    );
  });
});
