import { describe, expect, it } from "vitest";

import { normalizeMerchant } from "./merchant";

// All descriptors are synthetic — no real merchants, employers, or IBANs.
describe("normalizeMerchant", () => {
  const cases: { name: string; raw: string | null; expected: string | null }[] =
    [
      { name: "null passes through", raw: null, expected: null },
      { name: "empty string", raw: "", expected: null },
      { name: "whitespace only", raw: "   ", expected: null },
      { name: "lowercases", raw: "COFFEE BAR", expected: "coffee bar" },
      {
        name: "strips ccv* acquirer prefix",
        raw: "CCV*Coffee Bar",
        expected: "coffee bar",
      },
      {
        name: "strips zettle_* acquirer prefix",
        raw: "Zettle_*Book Shop",
        expected: "book shop",
      },
      {
        name: "strips bck acquirer prefix",
        raw: "BCK Bakery Place",
        expected: "bakery place",
      },
      {
        name: "strips sumup acquirer prefix with spaced star",
        raw: "SumUp *Flower Stand",
        expected: "flower stand",
      },
      {
        name: "unwinds stacked acquirer prefixes",
        raw: "CCV*SUMUP Test Store",
        expected: "test store",
      },
      {
        name: "strips a long digit run",
        raw: "Coffee Bar 0012345678",
        expected: "coffee bar",
      },
      {
        name: "strips a terminal id",
        raw: "Book Shop TERM0042",
        expected: "book shop",
      },
      {
        name: "strips date and time noise",
        raw: "Lunch Spot 13:45 16-06-2026",
        expected: "lunch spot",
      },
      {
        name: "strips a trailing city",
        raw: "Coffee Bar Amsterdam",
        expected: "coffee bar",
      },
      {
        name: "strips a trailing multi-word city",
        raw: "Coffee Bar Den Haag",
        expected: "coffee bar",
      },
      {
        name: "keeps a non-trailing city in the name",
        raw: "Amsterdam Cheese Co",
        expected: "amsterdam cheese co",
      },
      {
        name: "a string that is only a prefix collapses to null",
        raw: "CCV*",
        expected: null,
      },
      {
        name: "is idempotent on already-normalized input",
        raw: "coffee bar",
        expected: "coffee bar",
      },
    ];

  it.each(cases)("$name", ({ raw, expected }) => {
    expect(normalizeMerchant(raw)).toBe(expected);
  });

  it("is stable under a second pass", () => {
    const once = normalizeMerchant("CCV*Bistro Place 0098765 Utrecht");
    expect(once).toBe("bistro place");
    expect(normalizeMerchant(once)).toBe(once);
  });
});
