import { randomUUID } from "node:crypto";

import { prisma } from "@/server/db";

// Internal transfers: an opposite-amount pair between two DIFFERENT owned
// accounts within ±2 booking days (same currency). Both legs get
// isInternalTransfer=true and a shared transferPairId. Nearest booking date
// wins when several partners are possible; a transaction joins at most one pair.
//
// The pairing itself is a pure function (table-tested). The service loads the
// currently-unpaired rows, converts Decimal → integer cents, runs the matcher,
// and writes the flag + pair id. It is idempotent: already-paired rows are
// excluded, so re-running after every sync (or as a backfill) is safe.

const DAY_MS = 86_400_000;
const MAX_PAIR_DAYS = 2;

export interface PairCandidate {
  id: string;
  accountId: string;
  /** Signed integer cents — exact, no float math. */
  amountCents: number;
  currency: string;
  /** @db.Date value (UTC-midnight calendar day). */
  bookingDate: Date;
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Match opposite-amount transfer legs. Returns `[lowerId, higherId]` tuples,
 * deterministically ordered. Pure: no DB, no clock, no timezone.
 */
export function pairTransfers(txs: PairCandidate[]): Array<[string, string]> {
  // Sort by date so the inner scan can stop once it passes the ±2-day window,
  // and so candidate ties resolve deterministically by id.
  const sorted = [...txs].sort(
    (a, b) =>
      a.bookingDate.getTime() - b.bookingDate.getTime() || cmp(a.id, b.id),
  );

  type Candidate = { aId: string; bId: string; dayDiff: number };
  const candidates: Candidate[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i];
    if (a.amountCents === 0) continue;
    for (let j = i + 1; j < sorted.length; j++) {
      const b = sorted[j];
      const dayDiff = Math.round(
        (b.bookingDate.getTime() - a.bookingDate.getTime()) / DAY_MS,
      );
      if (dayDiff > MAX_PAIR_DAYS) break; // sorted ascending: nothing further is in range
      if (a.accountId === b.accountId) continue;
      if (a.currency !== b.currency) continue;
      if (a.amountCents !== -b.amountCents) continue;
      const [lo, hi] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];
      candidates.push({ aId: lo, bId: hi, dayDiff });
    }
  }

  // Nearest booking date wins; ties broken by id for determinism.
  candidates.sort(
    (x, y) => x.dayDiff - y.dayDiff || cmp(x.aId, y.aId) || cmp(x.bId, y.bId),
  );

  const used = new Set<string>();
  const pairs: Array<[string, string]> = [];
  for (const c of candidates) {
    if (used.has(c.aId) || used.has(c.bId)) continue;
    used.add(c.aId);
    used.add(c.bId);
    pairs.push([c.aId, c.bId]);
  }

  pairs.sort((p, q) => cmp(p[0], q[0]) || cmp(p[1], q[1]));
  return pairs;
}

/**
 * Find and link internal-transfer pairs among currently-unpaired transactions.
 * Idempotent — safe to run after every sync and as a backfill.
 */
export async function detectAndLinkTransfers(): Promise<{ pairs: number }> {
  const rows = await prisma.transaction.findMany({
    where: { transferPairId: null },
    select: {
      id: true,
      accountId: true,
      amount: true,
      currency: true,
      bookingDate: true,
    },
  });

  const candidates: PairCandidate[] = rows.map((r) => ({
    id: r.id,
    accountId: r.accountId,
    // Decimal(12,2).times(100) is always an exact integer Decimal far below
    // MAX_SAFE_INTEGER — never float-multiply the raw number before rounding.
    amountCents: r.amount.times(100).toNumber(),
    currency: r.currency,
    bookingDate: r.bookingDate,
  }));

  const pairs = pairTransfers(candidates);
  if (pairs.length === 0) return { pairs: 0 };

  await prisma.$transaction(
    pairs.map(([a, b]) =>
      prisma.transaction.updateMany({
        where: { id: { in: [a, b] } },
        data: { isInternalTransfer: true, transferPairId: randomUUID() },
      }),
    ),
  );

  console.info(`[transfers] linked pairs=${pairs.length}`);
  return { pairs: pairs.length };
}
