import { describe, expect, it } from "vitest";

import { pairTransfers, type PairCandidate } from "./transfers";

function day(s: string): Date {
  return new Date(`${s}T00:00:00.000Z`);
}

// Compact candidate builder: tx(id, accountId, cents, "YYYY-MM-DD", currency?)
function tx(
  id: string,
  accountId: string,
  amountCents: number,
  date: string,
  currency = "EUR",
): PairCandidate {
  return { id, accountId, amountCents, currency, bookingDate: day(date) };
}

describe("pairTransfers", () => {
  const cases: {
    name: string;
    txs: PairCandidate[];
    expected: Array<[string, string]>;
  }[] = [
    { name: "empty list", txs: [], expected: [] },
    { name: "single tx", txs: [tx("a", "x", -5000, "2026-06-10")], expected: [] },
    {
      name: "simple opposite pair across accounts, same day",
      txs: [tx("a", "x", -5000, "2026-06-10"), tx("b", "y", 5000, "2026-06-10")],
      expected: [["a", "b"]],
    },
    {
      name: "same account never pairs",
      txs: [tx("a", "x", -5000, "2026-06-10"), tx("b", "x", 5000, "2026-06-10")],
      expected: [],
    },
    {
      name: "currency mismatch never pairs (match only when currency equal)",
      txs: [
        tx("a", "x", -5000, "2026-06-10", "EUR"),
        tx("b", "y", 5000, "2026-06-10", "USD"),
      ],
      expected: [],
    },
    {
      name: "non-opposite amounts never pair",
      txs: [tx("a", "x", -5000, "2026-06-10"), tx("b", "y", 4000, "2026-06-10")],
      expected: [],
    },
    {
      name: "day diff of exactly 2 pairs (inclusive)",
      txs: [tx("a", "x", -5000, "2026-06-10"), tx("b", "y", 5000, "2026-06-12")],
      expected: [["a", "b"]],
    },
    {
      name: "day diff of 3 is out of range",
      txs: [tx("a", "x", -5000, "2026-06-10"), tx("b", "y", 5000, "2026-06-13")],
      expected: [],
    },
    {
      name: "zero amounts are ignored",
      txs: [tx("a", "x", 0, "2026-06-10"), tx("b", "y", 0, "2026-06-10")],
      expected: [],
    },
    {
      name: "nearest booking date wins among candidates",
      txs: [
        tx("x", "ax", -5000, "2026-06-10"),
        tx("y", "ay", 5000, "2026-06-10"),
        tx("z", "az", 5000, "2026-06-12"),
      ],
      // x pairs with the same-day y; z is left unpaired.
      expected: [["x", "y"]],
    },
    {
      name: "id tiebreak when day diff is equal",
      txs: [
        tx("x", "ax", -5000, "2026-06-10"),
        tx("ya", "ay", 5000, "2026-06-11"),
        tx("yb", "az", 5000, "2026-06-11"),
      ],
      // both candidates are 1 day off x; lower id (ya) wins.
      expected: [["x", "ya"]],
    },
    {
      name: "two disjoint pairs both returned, sorted",
      txs: [
        tx("p", "ax", -2500, "2026-06-05"),
        tx("q", "ay", 2500, "2026-06-05"),
        tx("a", "ax", -9000, "2026-06-01"),
        tx("b", "ay", 9000, "2026-06-01"),
      ],
      expected: [
        ["a", "b"],
        ["p", "q"],
      ],
    },
    {
      name: "a transaction joins at most one pair (no double use in a chain)",
      txs: [
        tx("t1", "x", -5000, "2026-06-01"),
        tx("t2", "y", 5000, "2026-06-01"),
        tx("t3", "y", -5000, "2026-06-02"),
        tx("t4", "z", 5000, "2026-06-02"),
      ],
      // t1-t2 (0 days) and t3-t4 (0 days) win; t1-t4 (1 day) is blocked.
      expected: [
        ["t1", "t2"],
        ["t3", "t4"],
      ],
    },
  ];

  it.each(cases)("$name", ({ txs, expected }) => {
    expect(pairTransfers(txs)).toEqual(expected);
  });

  it("is order-independent (shuffled input yields the same pairs)", () => {
    const txs = [
      tx("a", "x", -5000, "2026-06-10"),
      tx("b", "y", 5000, "2026-06-11"),
      tx("c", "z", -5000, "2026-06-10"),
      tx("d", "w", 5000, "2026-06-10"),
    ];
    const forward = pairTransfers(txs);
    const reversed = pairTransfers([...txs].reverse());
    expect(reversed).toEqual(forward);
  });
});
