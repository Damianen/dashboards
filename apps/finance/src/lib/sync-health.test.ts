import { describe, expect, it } from "vitest";

import { evaluateSyncHealth, type SyncHealthReason } from "@/lib/sync-health";

const NOW = "2026-06-16T12:00:00Z"; // Amsterdam: 2026-06-16 (CEST)

function conn(over: {
  id?: string;
  validUntil?: string | null;
  lastSyncedAt?: string | null;
  failures?: number;
}) {
  return {
    id: over.id ?? "c1",
    validUntil: over.validUntil === undefined ? null : over.validUntil ? new Date(over.validUntil) : null,
    lastSyncedAt:
      over.lastSyncedAt === undefined || over.lastSyncedAt === null
        ? null
        : new Date(over.lastSyncedAt),
    consecutiveFailures: over.failures ?? 0,
    status: "AUTHORIZED",
  };
}

describe("evaluateSyncHealth — alert decision", () => {
  const cases: {
    name: string;
    validUntil: string | null;
    failures: number;
    days: number | null;
    expiringSoon: boolean;
    failing: boolean;
    shouldAlert: boolean;
    reason: SyncHealthReason;
  }[] = [
    { name: "expires in 8d → no alert", validUntil: "2026-06-24T12:00:00Z", failures: 0, days: 8, expiringSoon: false, failing: false, shouldAlert: false, reason: null },
    { name: "expires in 7d → alert", validUntil: "2026-06-23T12:00:00Z", failures: 0, days: 7, expiringSoon: true, failing: false, shouldAlert: true, reason: "expiring" },
    { name: "expires in 6d → alert", validUntil: "2026-06-22T12:00:00Z", failures: 0, days: 6, expiringSoon: true, failing: false, shouldAlert: true, reason: "expiring" },
    { name: "already expired → alert", validUntil: "2026-06-10T12:00:00Z", failures: 0, days: -6, expiringSoon: true, failing: false, shouldAlert: true, reason: "expiring" },
    { name: "no validUntil → no alert", validUntil: null, failures: 0, days: null, expiringSoon: false, failing: false, shouldAlert: false, reason: null },
    { name: "2 failures → no alert", validUntil: "2026-12-01T12:00:00Z", failures: 2, days: 168, expiringSoon: false, failing: false, shouldAlert: false, reason: null },
    { name: "3 failures → alert", validUntil: "2026-12-01T12:00:00Z", failures: 3, days: 168, expiringSoon: false, failing: true, shouldAlert: true, reason: "failing" },
    { name: "expiring and failing", validUntil: "2026-06-22T12:00:00Z", failures: 4, days: 6, expiringSoon: true, failing: true, shouldAlert: true, reason: "expiring+failing" },
  ];
  it.each(cases)("$name", (c) => {
    const h = evaluateSyncHealth(conn({ validUntil: c.validUntil, failures: c.failures }), new Date(NOW));
    expect(h.daysOfValidity).toBe(c.days);
    expect(h.expiringSoon).toBe(c.expiringSoon);
    expect(h.failing).toBe(c.failing);
    expect(h.shouldAlert).toBe(c.shouldAlert);
    expect(h.reason).toBe(c.reason);
  });
});

describe("evaluateSyncHealth — days across DST boundaries", () => {
  const cases: { name: string; now: string; validUntil: string; days: number }[] = [
    { name: "spring-forward (count to 2026-03-29)", now: "2026-03-25T12:00:00Z", validUntil: "2026-03-29T12:00:00Z", days: 4 },
    { name: "fall-back (count to 2026-10-25)", now: "2026-10-21T12:00:00Z", validUntil: "2026-10-25T12:00:00Z", days: 4 },
  ];
  it.each(cases)("$name", ({ now, validUntil, days }) => {
    const h = evaluateSyncHealth(conn({ validUntil }), new Date(now));
    expect(h.daysOfValidity).toBe(days);
    expect(h.expiringSoon).toBe(true);
  });
});

describe("evaluateSyncHealth — dedupe key re-arms", () => {
  const cases: {
    name: string;
    now: string;
    validUntil: string | null;
    lastSyncedAt: string | null;
    failures: number;
    expected: string | null;
  }[] = [
    { name: "failing, last success known", now: NOW, validUntil: "2026-12-01T12:00:00Z", lastSyncedAt: "2026-06-10T12:00:00Z", failures: 3, expected: "sync-fail:c1:2026-06-10" },
    { name: "failing, never succeeded", now: NOW, validUntil: "2026-12-01T12:00:00Z", lastSyncedAt: null, failures: 3, expected: "sync-fail:c1:never" },
    { name: "failing re-arms after recovery (new anchor)", now: NOW, validUntil: "2026-12-01T12:00:00Z", lastSyncedAt: "2026-06-15T12:00:00Z", failures: 3, expected: "sync-fail:c1:2026-06-15" },
    { name: "expiring anchored on validUntil", now: NOW, validUntil: "2026-06-20T12:00:00Z", lastSyncedAt: "2026-06-15T12:00:00Z", failures: 0, expected: "consent-expiry:c1:2026-06-20" },
    { name: "expiring re-arms after re-consent (later expiry)", now: "2026-12-16T12:00:00Z", validUntil: "2026-12-20T12:00:00Z", lastSyncedAt: "2026-12-15T12:00:00Z", failures: 0, expected: "consent-expiry:c1:2026-12-20" },
    { name: "both → expiry key wins", now: NOW, validUntil: "2026-06-22T12:00:00Z", lastSyncedAt: "2026-06-10T12:00:00Z", failures: 4, expected: "consent-expiry:c1:2026-06-22" },
    { name: "no alert → null key", now: NOW, validUntil: "2026-12-01T12:00:00Z", lastSyncedAt: "2026-06-15T12:00:00Z", failures: 0, expected: null },
  ];
  it.each(cases)("$name", (c) => {
    const h = evaluateSyncHealth(
      conn({ validUntil: c.validUntil, lastSyncedAt: c.lastSyncedAt, failures: c.failures }),
      new Date(c.now),
    );
    expect(h.dedupeKey).toBe(c.expected);
  });
});
