import { describe, expect, it } from "vitest";

import {
  assertNoCycle,
  computeMealMacros,
  scaleMacrosBy,
  sumMacros,
} from "./meals";
import type { Macros } from "./rules";

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

describe("sumMacros", () => {
  it("returns all-null for no items (never fabricates 0)", () => {
    expect(sumMacros([])).toEqual(macros({}));
  });

  it("sums present values across items, rounding to 1 dp", () => {
    const out = sumMacros([
      macros({ kcal: 100.04, proteinG: 5.1 }),
      macros({ kcal: 50.03, proteinG: 2.2 }),
    ]);
    expect(out.kcal).toBe(150.1);
    expect(out.proteinG).toBe(7.3);
  });

  it("treats null as absent: a field is null only when EVERY item is null", () => {
    const out = sumMacros([
      macros({ kcal: 100, fiberG: 2 }), // fiber known here
      macros({ kcal: 100 }), // fiber unknown here
      macros({ kcal: 100 }), // salt unknown in all three
    ]);
    expect(out.fiberG).toBe(2); // present in one item → sum of present
    expect(out.saltG).toBeNull(); // null in all → stays null
    expect(out.kcal).toBe(300);
  });
});

describe("scaleMacrosBy", () => {
  it("multiplies each field by the factor (1 dp), keeping nulls null", () => {
    const out = scaleMacrosBy(macros({ kcal: 200, proteinG: 10.05 }), 1.5);
    expect(out.kcal).toBe(300);
    expect(out.proteinG).toBe(15.1); // 15.075 → 15.1
    expect(out.fatG).toBeNull();
  });

  it("scales down by a fractional factor (per-portion division)", () => {
    const out = scaleMacrosBy(macros({ kcal: 500, carbG: 50 }), 1 / 2.5);
    expect(out.kcal).toBe(200);
    expect(out.carbG).toBe(20);
  });
});

describe("computeMealMacros", () => {
  it("totals a mix of item contributions and divides by a fractional yield", () => {
    const { total, perPortion } = computeMealMacros(
      [
        macros({ kcal: 330, proteinG: 30, carbG: 40, fatG: 5 }), // e.g. a product
        macros({ kcal: 200, proteinG: 4, carbG: 42, fatG: 1.5 }), // e.g. a custom food
        macros({ kcal: 120, proteinG: 2, carbG: 18, fatG: 4 }), // e.g. a nested meal
      ],
      2.5,
    );
    expect(total.kcal).toBe(650);
    expect(total.proteinG).toBe(36);
    expect(perPortion.kcal).toBe(260); // 650 / 2.5
    expect(perPortion.carbG).toBe(40); // 100 / 2.5
  });

  it("preserves nulls through the total and per-portion division", () => {
    const { total, perPortion } = computeMealMacros(
      [macros({ kcal: 100, fiberG: 3 }), macros({ kcal: 100 })],
      2,
    );
    expect(total.fiberG).toBe(3);
    expect(perPortion.fiberG).toBe(1.5);
    expect(total.saltG).toBeNull();
    expect(perPortion.saltG).toBeNull();
  });

  it("carries caffeine (mg) into the total and per-portion snapshot", () => {
    // A 2-portion pre-workout shake: only one item is caffeinated.
    const { total, perPortion } = computeMealMacros(
      [macros({ kcal: 100, caffeineMg: 200 }), macros({ kcal: 100 })],
      2,
    );
    expect(total.caffeineMg).toBe(200);
    expect(perPortion.caffeineMg).toBe(100); // 200 / 2 portions
  });

  it("rounds per-portion macros to 1 dp", () => {
    const { perPortion } = computeMealMacros([macros({ kcal: 100 })], 3);
    expect(perPortion.kcal).toBe(33.3); // 33.333… → 33.3
  });

  it("rejects a non-positive yield", () => {
    expect(() => computeMealMacros([macros({ kcal: 1 })], 0)).toThrow();
    expect(() => computeMealMacros([macros({ kcal: 1 })], -1)).toThrow();
  });
});

describe("assertNoCycle", () => {
  it("rejects a meal containing itself directly", () => {
    expect(() => assertNoCycle("a", "a", {})).toThrow(/itself/);
  });

  it("rejects a transitive cycle (b→c→a, then make a contain b)", () => {
    const adjacency = { b: ["c"], c: ["a"] };
    expect(() => assertNoCycle("a", "b", adjacency)).toThrow(/transitively/);
  });

  it("allows a child whose subtree never reaches the parent", () => {
    const adjacency = { b: ["c"], c: [] };
    expect(() => assertNoCycle("a", "b", adjacency)).not.toThrow();
  });

  it("handles missing adjacency entries without throwing", () => {
    expect(() => assertNoCycle("a", "b", {})).not.toThrow();
  });

  it("tolerates a cyclic adjacency graph without infinite-looping", () => {
    // b and c reference each other but neither reaches a — must terminate and pass.
    const adjacency = { b: ["c"], c: ["b"] };
    expect(() => assertNoCycle("a", "b", adjacency)).not.toThrow();
  });
});
