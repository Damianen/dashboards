// Net-worth wire shapes + the pure history builder. Balances live in
// BalanceSnapshot (one row per account per day). The service
// (src/server/services/net-worth.ts) loads snapshots as integer cents and calls
// buildNetWorthHistory; this module does the carry-forward merge with no DB and
// no float maths (cents in, 2dp strings out).
//
// An account contributes 0 to the total before its first snapshot (its balance
// is genuinely unknown then) and its last-known balance afterwards — so the
// total line can only rise as accounts come online, never dip on missing data.

export interface NetWorthSnapshot {
  accountId: string;
  date: string; // YYYY-MM-DD
  amountCents: number; // signed integer cents
}

export interface NetWorthAccountMeta {
  id: string;
  label: string;
  bank: string;
}

export interface NetWorthPoint {
  date: string; // YYYY-MM-DD
  total: string; // 2dp, signed
}

export interface NetWorthAccountSeries {
  accountId: string;
  label: string;
  bank: string;
  points: { date: string; amount: string }[]; // carried-forward balance per axis date
}

export interface NetWorthHistory {
  points: NetWorthPoint[];
  accounts: NetWorthAccountSeries[];
}

export interface NetWorthAccountBalance {
  accountId: string;
  name: string;
  bank: string;
  balance: string; // 2dp, signed
  asOf: string; // YYYY-MM-DD of the snapshot used
}

export interface NetWorthCurrent {
  asOf: string | null; // most recent snapshot date across accounts
  currency: string;
  total: string; // 2dp, signed sum of latest per-account balances
  accounts: NetWorthAccountBalance[];
}

/** Exact integer-cents → signed 2dp string (no float division). */
export function centsToString(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/**
 * Carry-forward merge of per-account snapshots into a combined total series plus
 * per-account series, over the union of all snapshot dates (ascending). Pure.
 */
export function buildNetWorthHistory(
  snapshots: NetWorthSnapshot[],
  accounts: NetWorthAccountMeta[],
): NetWorthHistory {
  const axis = [...new Set(snapshots.map((s) => s.date))].sort();

  const byAccount = new Map<string, Map<string, number>>();
  for (const s of snapshots) {
    let m = byAccount.get(s.accountId);
    if (!m) byAccount.set(s.accountId, (m = new Map()));
    m.set(s.date, s.amountCents);
  }

  const totalByDate = new Map<string, number>(axis.map((d) => [d, 0]));
  const accountSeries: NetWorthAccountSeries[] = [];

  for (const acc of accounts) {
    const snaps = byAccount.get(acc.id);
    if (!snaps || snaps.size === 0) continue; // an account with no history is omitted

    const points: { date: string; amount: string }[] = [];
    let last: number | null = null;
    for (const d of axis) {
      if (snaps.has(d)) last = snaps.get(d)!;
      if (last !== null) {
        points.push({ date: d, amount: centsToString(last) });
        totalByDate.set(d, totalByDate.get(d)! + last);
      }
    }
    accountSeries.push({
      accountId: acc.id,
      label: acc.label,
      bank: acc.bank,
      points,
    });
  }

  const points: NetWorthPoint[] = axis.map((d) => ({
    date: d,
    total: centsToString(totalByDate.get(d)!),
  }));

  return { points, accounts: accountSeries };
}
