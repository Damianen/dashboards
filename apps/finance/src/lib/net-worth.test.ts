import { describe, expect, it } from "vitest";

import {
  buildNetWorthHistory,
  centsToString,
  type NetWorthAccountMeta,
  type NetWorthSnapshot,
} from "./net-worth";

const ACCOUNTS: NetWorthAccountMeta[] = [
  { id: "a", label: "ING Checking", bank: "ING" },
  { id: "b", label: "Revolut", bank: "REVOLUT" },
];

describe("centsToString", () => {
  it.each([
    { cents: 0, expected: "0.00" },
    { cents: 5, expected: "0.05" },
    { cents: 1234, expected: "12.34" },
    { cents: -1234, expected: "-12.34" },
    { cents: 100000, expected: "1000.00" },
    { cents: -7, expected: "-0.07" },
  ])("centsToString($cents) = $expected", ({ cents, expected }) => {
    expect(centsToString(cents)).toBe(expected);
  });
});

describe("buildNetWorthHistory", () => {
  it("returns empty axis for no snapshots", () => {
    expect(buildNetWorthHistory([], ACCOUNTS)).toEqual({
      points: [],
      accounts: [],
    });
  });

  it("tracks a single account over its snapshot dates", () => {
    const snaps: NetWorthSnapshot[] = [
      { accountId: "a", date: "2026-01-01", amountCents: 100000 },
      { accountId: "a", date: "2026-02-01", amountCents: 120000 },
    ];
    expect(buildNetWorthHistory(snaps, ACCOUNTS)).toEqual({
      points: [
        { date: "2026-01-01", total: "1000.00" },
        { date: "2026-02-01", total: "1200.00" },
      ],
      accounts: [
        {
          accountId: "a",
          label: "ING Checking",
          bank: "ING",
          points: [
            { date: "2026-01-01", amount: "1000.00" },
            { date: "2026-02-01", amount: "1200.00" },
          ],
        },
      ],
    });
  });

  it("carries forward each account's last balance across the union axis", () => {
    // a snapshots on Jan/Mar; b snapshots only on Feb. On Feb, a carries 1000;
    // on Mar, b carries 500.
    const snaps: NetWorthSnapshot[] = [
      { accountId: "a", date: "2026-01-01", amountCents: 100000 },
      { accountId: "b", date: "2026-02-01", amountCents: 50000 },
      { accountId: "a", date: "2026-03-01", amountCents: 110000 },
    ];
    const out = buildNetWorthHistory(snaps, ACCOUNTS);
    expect(out.points).toEqual([
      { date: "2026-01-01", total: "1000.00" }, // only a known
      { date: "2026-02-01", total: "1500.00" }, // a carried 1000 + b 500
      { date: "2026-03-01", total: "1600.00" }, // a 1100 + b carried 500
    ]);
    expect(out.accounts).toEqual([
      {
        accountId: "a",
        label: "ING Checking",
        bank: "ING",
        points: [
          { date: "2026-01-01", amount: "1000.00" },
          { date: "2026-02-01", amount: "1000.00" },
          { date: "2026-03-01", amount: "1100.00" },
        ],
      },
      {
        accountId: "b",
        label: "Revolut",
        bank: "REVOLUT",
        // b only appears from its first snapshot (Feb) onward.
        points: [
          { date: "2026-02-01", amount: "500.00" },
          { date: "2026-03-01", amount: "500.00" },
        ],
      },
    ]);
  });

  it("omits accounts with no snapshots and handles negative balances", () => {
    const snaps: NetWorthSnapshot[] = [
      { accountId: "a", date: "2026-01-01", amountCents: -2500 },
      { accountId: "a", date: "2026-01-02", amountCents: 7500 },
    ];
    const out = buildNetWorthHistory(snaps, ACCOUNTS);
    expect(out.accounts.map((a) => a.accountId)).toEqual(["a"]);
    expect(out.points).toEqual([
      { date: "2026-01-01", total: "-25.00" },
      { date: "2026-01-02", total: "75.00" },
    ]);
  });
});
