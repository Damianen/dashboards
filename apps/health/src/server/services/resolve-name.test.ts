import { describe, expect, it } from "vitest";

import { type NameFilter, resolveUniqueByName } from "./resolve-name";

interface Row {
  id: string;
  name: string;
  archived: boolean;
}

const ROWS: Row[] = [
  { id: "m1", name: "Overnight oats", archived: false },
  { id: "m2", name: "Oats", archived: false },
  { id: "m3", name: "Protein oats", archived: false },
  { id: "m4", name: "Chili", archived: false },
  { id: "m5", name: "chili", archived: false },
];

/** In-memory stand-in for the Prisma query the real wrappers run: name-sorted,
 *  case-insensitive equals/contains, optional take. */
function findIn(rows: Row[]) {
  return async (filter: NameFilter, take?: number): Promise<Row[]> => {
    const matches = rows
      .filter((r) => {
        if (filter.equals !== undefined) {
          return r.name.toLowerCase() === filter.equals.toLowerCase();
        }
        if (filter.contains !== undefined) {
          return r.name.toLowerCase().includes(filter.contains.toLowerCase());
        }
        return false;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    return take === undefined ? matches : matches.slice(0, take);
  };
}

describe("resolveUniqueByName", () => {
  it("returns the match on a single exact hit", async () => {
    const result = await resolveUniqueByName("Oats", findIn(ROWS));
    expect(result).toEqual({ match: ROWS[1] });
  });

  it("matches exactly case-insensitively (and trims the query)", async () => {
    const result = await resolveUniqueByName("  oAtS ", findIn(ROWS));
    expect(result).toEqual({ match: ROWS[1] });
  });

  it("returns all exact-but-ambiguous hits as candidates", async () => {
    const result = await resolveUniqueByName("chili", findIn(ROWS));
    if (!("candidates" in result)) throw new Error("expected candidates");
    // Order comes from the caller's query; only membership matters here.
    expect(result.candidates.map((c) => c.id).sort()).toEqual(["m4", "m5"]);
    expect(result.candidates.every((c) => c.name.toLowerCase() === "chili")).toBe(
      true,
    );
  });

  it("falls back to a fuzzy substring match when it is the only hit", async () => {
    const result = await resolveUniqueByName("overnight", findIn(ROWS));
    expect(result).toEqual({
      candidates: [{ id: "m1", name: "Overnight oats" }],
    });
  });

  it("returns multiple fuzzy hits as candidates, capped at 10", async () => {
    const result = await resolveUniqueByName("oat", findIn(ROWS));
    expect(result).toEqual({
      candidates: [
        { id: "m2", name: "Oats" },
        { id: "m1", name: "Overnight oats" },
        { id: "m3", name: "Protein oats" },
      ],
    });

    const many: Row[] = Array.from({ length: 15 }, (_, i) => ({
      id: `x${i}`,
      name: `Bowl ${String(i).padStart(2, "0")}`,
      archived: false,
    }));
    const capped = await resolveUniqueByName("bowl", findIn(many));
    if (!("candidates" in capped)) throw new Error("expected candidates");
    expect(capped.candidates).toHaveLength(10);
  });

  it("returns empty candidates when nothing matches", async () => {
    const result = await resolveUniqueByName("pizza", findIn(ROWS));
    expect(result).toEqual({ candidates: [] });
  });
});
