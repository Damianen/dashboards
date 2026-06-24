// Pure, deterministic meal (recipe) logic — vitest-covered (CLAUDE.md "Definition
// of done"). No Prisma/Zod here; the service resolves each item to a Macros
// contribution and feeds these helpers. DomainError is a plain error class with no
// server-only deps (same import as src/lib/rules.ts), so this module stays client-safe.

import type { Macros } from "@/lib/rules";
import { DomainError } from "@/server/services/errors";

const MACRO_KEYS = [
  "kcal",
  "proteinG",
  "carbG",
  "fatG",
  "fiberG",
  "sugarG",
  "saltG",
  "caffeineMg",
] as const satisfies readonly (keyof Macros)[];

const round1 = (v: number): number => Math.round(v * 10) / 10;

/**
 * Sum item macro contributions with SQL-style null semantics: a field is null only
 * when EVERY item is null for it; otherwise it is the sum of the present values (an
 * unknown nutrient is never coerced to 0 — that only happens when a FoodEntry's four
 * required columns are persisted). Each total rounded to 1 dp (the scaleMacros idiom).
 */
export function sumMacros(items: Macros[]): Macros {
  const out = {} as Macros;
  for (const key of MACRO_KEYS) {
    let sum = 0;
    let present = false;
    for (const item of items) {
      const v = item[key];
      if (v != null) {
        sum += v;
        present = true;
      }
    }
    out[key] = present ? round1(sum) : null;
  }
  return out;
}

/**
 * Scale every macro by `factor` (1 dp), keeping nulls null. Used to fold a nested
 * meal's per-portion macros by its portion count when resolving a recipe, and to
 * scale a meal's per-portion macros by the portions logged. Distinct from
 * scaleMacros, which divides by 100 for per-100 g inputs.
 */
export function scaleMacrosBy(m: Macros, factor: number): Macros {
  const out = {} as Macros;
  for (const key of MACRO_KEYS) {
    const v = m[key];
    out[key] = v == null ? null : round1(v * factor);
  }
  return out;
}

/**
 * Total and per-portion macros for a recipe, from its already-resolved item
 * contributions. perPortion = total / yieldPortions (1 dp, nulls preserved). Pure —
 * the service snapshots the perPortion result on the Meal row.
 */
export function computeMealMacros(
  resolvedItems: Macros[],
  yieldPortions: number,
): { total: Macros; perPortion: Macros } {
  if (!(yieldPortions > 0)) {
    throw new DomainError("yieldPortions must be greater than 0");
  }
  const total = sumMacros(resolvedItems);
  const perPortion = scaleMacrosBy(total, 1 / yieldPortions);
  return { total, perPortion };
}

/**
 * Throw if adding the edge mealId → childMealId would let a meal contain itself
 * directly or transitively. `adjacency` maps each meal id to the ids of the meals it
 * currently nests; the service builds it from the persisted MealItem child edges. A
 * cycle exists iff childMealId can already reach mealId (or is mealId itself).
 */
export function assertNoCycle(
  mealId: string,
  childMealId: string,
  adjacency: Record<string, string[]>,
): void {
  if (childMealId === mealId) {
    throw new DomainError("a meal cannot contain itself");
  }
  const seen = new Set<string>();
  const stack = [childMealId];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined || seen.has(current)) continue;
    seen.add(current);
    if (current === mealId) {
      throw new DomainError(
        "a meal cannot contain itself, even transitively through a nested meal",
      );
    }
    for (const next of adjacency[current] ?? []) stack.push(next);
  }
}
