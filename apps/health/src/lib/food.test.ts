import { describe, expect, it } from "vitest";

import {
  compareCustomFoodRecency,
  dayTotal,
  type EntryTotals,
  type FoodEntryDTO,
  type FoodEntryView,
  groupByMeal,
  rescaleEntryTotals,
  suggestMeal,
  toView,
} from "./food";

// A local-time Date so getHours() is the constructed hour regardless of the
// test runner's timezone.
const at = (hour: number) => new Date(2026, 5, 16, hour, 0, 0);

describe("suggestMeal", () => {
  it("suggests breakfast in the morning", () => {
    expect(suggestMeal(at(8))).toBe("BREAKFAST");
  });
  it("suggests lunch at midday", () => {
    expect(suggestMeal(at(13))).toBe("LUNCH");
  });
  it("suggests dinner in the evening", () => {
    expect(suggestMeal(at(19))).toBe("DINNER");
  });
  it("suggests a snack late at night", () => {
    expect(suggestMeal(at(23))).toBe("SNACK");
  });
  it("uses < boundaries (11:00 → lunch, 15:00 → dinner, 21:00 → snack)", () => {
    expect(suggestMeal(at(11))).toBe("LUNCH");
    expect(suggestMeal(at(15))).toBe("DINNER");
    expect(suggestMeal(at(21))).toBe("SNACK");
  });
});

describe("compareCustomFoodRecency", () => {
  const food = (name: string, lastUsedAt: string | null) => ({
    name,
    lastUsedAt,
  });

  it("orders more-recently-used foods first", () => {
    const older = food("Apple", "2026-06-10T08:00:00.000Z");
    const newer = food("Banana", "2026-06-16T08:00:00.000Z");
    expect([older, newer].sort(compareCustomFoodRecency)).toEqual([
      newer,
      older,
    ]);
  });

  it("sorts never-used foods after used ones (regardless of name)", () => {
    const used = food("Zucchini", "2026-06-16T08:00:00.000Z");
    const never = food("Aaa never", null);
    expect([never, used].sort(compareCustomFoodRecency)).toEqual([used, never]);
  });

  it("breaks ties (both never used) by name A→Z", () => {
    const b = food("Banana", null);
    const a = food("Apple", null);
    expect([b, a].sort(compareCustomFoodRecency)).toEqual([a, b]);
  });

  it("breaks ties (same timestamp) by name A→Z", () => {
    const ts = "2026-06-16T08:00:00.000Z";
    const z = food("Zucchini", ts);
    const a = food("Almond", ts);
    expect([z, a].sort(compareCustomFoodRecency)).toEqual([a, z]);
  });
});

const dto = (over: Partial<FoodEntryDTO>): FoodEntryDTO => ({
  id: "e1",
  eatenAt: "2026-06-16T08:00:00.000Z",
  productBarcode: null,
  customName: null,
  mealId: null,
  portions: null,
  quantityG: "100",
  kcal: "0",
  proteinG: "0",
  carbG: "0",
  fatG: "0",
  meal: null,
  notes: null,
  product: null,
  customFood: null,
  ...over,
});

describe("toView", () => {
  it("coerces the Decimal string columns to numbers", () => {
    const v = toView(
      dto({ quantityG: "55.5", kcal: "123.4", proteinG: "5.1", carbG: "20.2", fatG: "3.3" }),
    );
    expect(v.quantityG).toBe(55.5);
    expect(v.kcal).toBe(123.4);
    expect(v.proteinG).toBe(5.1);
    expect(v.carbG).toBe(20.2);
    expect(v.fatG).toBe(3.3);
  });

  it("prefers the joined product name, marking it non-custom", () => {
    const v = toView(
      dto({ productBarcode: "5449000000996", product: { name: "Coca-Cola", brand: "Coca-Cola", imageUrl: null } }),
    );
    expect(v.displayName).toBe("Coca-Cola");
    expect(v.isCustom).toBe(false);
  });

  it("falls back to the custom name and marks it custom", () => {
    const v = toView(dto({ customName: "Homemade soup" }));
    expect(v.displayName).toBe("Homemade soup");
    expect(v.isCustom).toBe(true);
  });

  it("uses a saved custom food's name and shows its grams (non-custom)", () => {
    const v = toView(
      dto({
        customFood: { name: "Protein granola", brand: "DIY" },
        quantityG: "60",
      }),
    );
    expect(v.displayName).toBe("Protein granola");
    expect(v.quantityG).toBe(60);
    expect(v.isCustom).toBe(false); // real per-100g portion → grams shown
  });

  it("falls back to the barcode when a product join is missing", () => {
    const v = toView(dto({ productBarcode: "12345678", product: null }));
    expect(v.displayName).toBe("12345678");
    expect(v.isCustom).toBe(false);
  });

  it("passes notes through untouched", () => {
    expect(toView(dto({ notes: "AI estimate: assumed whole milk" })).notes).toBe(
      "AI estimate: assumed whole milk",
    );
    expect(toView(dto({ notes: null })).notes).toBeNull();
  });

  it("surfaces portions for a meal-logged entry (custom name = meal name)", () => {
    const v = toView(
      dto({
        mealId: "m1",
        portions: "1.5",
        customName: "Chicken & Rice",
        quantityG: null,
        kcal: "780",
      }),
    );
    expect(v.displayName).toBe("Chicken & Rice");
    expect(v.portions).toBe(1.5);
    expect(v.quantityG).toBeNull();
    expect(v.isCustom).toBe(true); // grams hidden; the row shows portions instead
  });
});

const view = (over: Partial<FoodEntryView>): FoodEntryView => ({
  id: "v",
  eatenAt: "2026-06-16T08:00:00.000Z",
  meal: null,
  displayName: "x",
  quantityG: 100,
  isCustom: false,
  portions: null,
  kcal: 0,
  proteinG: 0,
  carbG: 0,
  fatG: 0,
  notes: null,
  ...over,
});

describe("dayTotal", () => {
  it("sums the four macros", () => {
    const total = dayTotal([
      view({ kcal: 100, proteinG: 10, carbG: 20, fatG: 5 }),
      view({ kcal: 250, proteinG: 4, carbG: 30, fatG: 8 }),
    ]);
    expect(total).toEqual({ kcal: 350, proteinG: 14, carbG: 50, fatG: 13 });
  });

  it("is all-zero for an empty day", () => {
    expect(dayTotal([])).toEqual({ kcal: 0, proteinG: 0, carbG: 0, fatG: 0 });
  });
});

const totals = (over: Partial<EntryTotals>): EntryTotals => ({
  kcal: 200,
  proteinG: 10,
  carbG: 30,
  fatG: 5,
  fiberG: null,
  sugarG: null,
  saltG: null,
  caffeineMg: null,
  ...over,
});

describe("rescaleEntryTotals", () => {
  it("scales every field linearly when the quantity doubles", () => {
    const next = rescaleEntryTotals(
      totals({ fiberG: 2, sugarG: 8.5, saltG: 0.6, caffeineMg: 40 }),
      150,
      300,
    );
    expect(next).toEqual({
      kcal: 400,
      proteinG: 20,
      carbG: 60,
      fatG: 10,
      fiberG: 4,
      sugarG: 17,
      saltG: 1.2,
      caffeineMg: 80,
    });
  });

  it("scales down and rounds to 1 dp", () => {
    const next = rescaleEntryTotals(totals({ kcal: 123.4, proteinG: 5.1 }), 100, 33);
    expect(next.kcal).toBe(40.7); // 123.4 × 0.33 = 40.722
    expect(next.proteinG).toBe(1.7); // 5.1 × 0.33 = 1.683
  });

  it("keeps null detail fields null", () => {
    const next = rescaleEntryTotals(totals({}), 100, 250);
    expect(next.fiberG).toBeNull();
    expect(next.sugarG).toBeNull();
    expect(next.saltG).toBeNull();
    expect(next.caffeineMg).toBeNull();
  });

  it("is the identity when the quantity is unchanged", () => {
    const stored = totals({ fiberG: 1.5, saltG: 0.25 });
    // saltG rounds 1dp — 0.25 → 0.3 — so identity holds only for 1dp-clean values.
    expect(rescaleEntryTotals(totals({ fiberG: 1.5, saltG: 0.3 }), 120, 120)).toEqual(
      totals({ fiberG: 1.5, saltG: 0.3 }),
    );
    expect(rescaleEntryTotals(stored, 120, 120).saltG).toBe(0.3);
  });
});

describe("groupByMeal", () => {
  it("orders groups breakfast→snack, drops empty meals, computes subtotals", () => {
    const groups = groupByMeal([
      view({ id: "a", meal: "DINNER", kcal: 600 }),
      view({ id: "b", meal: "BREAKFAST", kcal: 300 }),
      view({ id: "c", meal: "BREAKFAST", kcal: 100 }),
    ]);
    expect(groups.map((g) => g.meal)).toEqual(["BREAKFAST", "DINNER"]);
    const [breakfast, dinner] = groups;
    expect(breakfast?.entries.map((e) => e.id)).toEqual(["b", "c"]);
    expect(breakfast?.subtotal.kcal).toBe(400);
    expect(dinner?.subtotal.kcal).toBe(600);
  });

  it("collects meal-less entries into a trailing Other group", () => {
    const groups = groupByMeal([
      view({ id: "a", meal: "LUNCH" }),
      view({ id: "b", meal: null }),
    ]);
    expect(groups.map((g) => g.label)).toEqual(["Lunch", "Other"]);
    expect(groups[1]?.meal).toBeNull();
  });

  it("returns no groups for an empty day", () => {
    expect(groupByMeal([])).toEqual([]);
  });
});
