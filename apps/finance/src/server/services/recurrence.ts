import { Prisma } from "@/generated/prisma/client";
import { DEFAULT_TIMEZONE } from "@/lib/dates";
import {
  detectRecurrence,
  intervalLabel,
  monthlyEquivalentCents,
  nextExpectedDate,
  subscriptionState,
} from "@/lib/recurrence";
import type {
  SubscriptionView,
  SubscriptionsResponse,
} from "@/lib/subscriptions";
import { prisma } from "@/server/db";

// Recurring-series detection over each merchant's expense history. The maths is
// pure (src/lib/recurrence.ts, table-tested); this layer loads rows, converts
// Decimal → exact integer cents (mirroring transfers.ts — never float-multiply),
// runs the detector, and upserts RecurringSeries. Idempotent: re-running after
// every sync re-evaluates each merchant and re-affirms active/lastSeen state.

/** Exact positive/negative integer-cents → 2dp string (no float division). */
function money2(cents: number): string {
  return new Prisma.Decimal(cents).div(100).toFixed(2);
}

/**
 * Re-detect every merchant's series from its expense history and upsert it.
 * Scoped to non-transfer outflows that have a merchantKey (set at categorize
 * time). Returns how many series were detected. Logs counts only.
 */
export async function persistRecurringSeries(
  now: Date = new Date(),
  tz: string = DEFAULT_TIMEZONE,
): Promise<{ merchants: number; detected: number }> {
  const rows = await prisma.transaction.findMany({
    where: {
      isInternalTransfer: false,
      amount: { lt: 0 },
      merchantKey: { not: null },
    },
    select: {
      merchantKey: true,
      bookingDate: true,
      amount: true,
      counterparty: true,
      descriptionRaw: true,
    },
    orderBy: { bookingDate: "asc" },
  });

  type Row = (typeof rows)[number];
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const key = r.merchantKey as string;
    const g = groups.get(key);
    if (g) g.push(r);
    else groups.set(key, [r]);
  }

  let detected = 0;
  for (const [merchantKey, group] of groups) {
    const result = detectRecurrence(
      group.map((r) => ({
        date: r.bookingDate,
        // Decimal(12,2)×100 is an exact integer Decimal well below MAX_SAFE_INTEGER.
        amountCents: r.amount.times(100).toNumber(),
      })),
    );
    if (!result) continue;

    const latest = group[group.length - 1]; // group is ascending by date
    const description = latest.counterparty ?? latest.descriptionRaw ?? null;
    const { active } = subscriptionState(
      result.lastSeenDate,
      result.intervalDays,
      now,
      tz,
    );

    const data = {
      description,
      expectedAmount: new Prisma.Decimal(result.expectedAmountCents).div(100),
      previousAmount:
        result.previousAmountCents !== null
          ? new Prisma.Decimal(result.previousAmountCents).div(100)
          : null,
      intervalDays: result.intervalDays,
      lastSeenDate: result.lastSeenDate,
      active,
    };

    await prisma.recurringSeries.upsert({
      where: { merchantKey },
      update: data,
      create: { merchantKey, ...data },
    });
    detected++;
  }

  console.info(`[recurrence] merchants=${groups.size} detected=${detected}`);
  return { merchants: groups.size, detected };
}

/**
 * Active subscriptions for the /subscriptions page and the MCP tool. Activity,
 * next-due, and the "missed" badge are recomputed against `now` (the persisted
 * `active` is only a coarse snapshot); price-increase comes from previousAmount.
 * Costs are emitted positive. Sorted by next expected date.
 */
export async function listSubscriptions(
  now: Date = new Date(),
  tz: string = DEFAULT_TIMEZONE,
): Promise<SubscriptionsResponse> {
  const series = await prisma.recurringSeries.findMany();

  const subscriptions: SubscriptionView[] = [];
  let monthlyTotalCents = 0;

  for (const s of series) {
    if (!s.lastSeenDate) continue;
    const state = subscriptionState(s.lastSeenDate, s.intervalDays, now, tz);
    if (!state.active) continue;

    const amountCents = s.expectedAmount.times(100).toNumber();
    const monthlyCents = monthlyEquivalentCents(amountCents, s.intervalDays);
    monthlyTotalCents += monthlyCents;

    subscriptions.push({
      id: s.id,
      name: s.description ?? s.merchantKey,
      merchantKey: s.merchantKey,
      amount: s.expectedAmount.abs().toFixed(2),
      intervalDays: s.intervalDays,
      intervalLabel: intervalLabel(s.intervalDays),
      nextExpected: nextExpectedDate(s.lastSeenDate, s.intervalDays)
        .toISOString()
        .slice(0, 10),
      monthlyEquivalent: money2(monthlyCents),
      missed: state.missed,
      priceIncreased: s.previousAmount !== null,
      previousAmount:
        s.previousAmount !== null ? s.previousAmount.abs().toFixed(2) : null,
    });
  }

  subscriptions.sort((a, b) =>
    a.nextExpected < b.nextExpected ? -1 : a.nextExpected > b.nextExpected ? 1 : 0,
  );

  return {
    monthlyTotal: money2(monthlyTotalCents),
    currency: "EUR",
    subscriptions,
  };
}
