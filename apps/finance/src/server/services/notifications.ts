import { ConnectionStatus, Prisma } from "@/generated/prisma/client";
import { budgetDedupeKey, crossedThresholds } from "@/lib/budget-pacing";
import {
  DEFAULT_TIMEZONE,
  addDaysToDayStart,
  zonedDateString,
  zonedDayStart,
} from "@/lib/dates";
import { evaluateSyncHealth } from "@/lib/sync-health";
import { prisma } from "@/server/db";

import { listBudgetsWithProgress } from "./budgets";
import { sendNtfy, type NtfyPayload } from "./ntfy";
import { getLargeTxnThreshold } from "./settings";

// Nightly notifications: budget 80/100% alerts, large-transaction alerts, and
// bank-sync re-consent reminders. Every push is deduplicated through
// NotificationLog (unique dedupeKey) so it fires at most once. All money/time
// rules apply: internal transfers are excluded, months bucket by booking date
// in Europe/Amsterdam. Deciding logic is pure (budget-pacing.ts, sync-health.ts);
// this layer reads the DB and pushes.

const LARGE_TXN_WINDOW_DAYS = 7;

export interface NotifyDeps {
  /** Injectable for tests; defaults to the real ntfy client. */
  send?: (payload: NtfyPayload) => Promise<void>;
  now?: Date;
  timeZone?: string;
}

export interface NotifyResult {
  budgetAlerts: number;
  largeTxnAlerts: number;
  syncHealthAlerts: number;
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "P2002"
  );
}

function appUrl(path: string): string {
  const base = process.env.APP_BASE_URL?.replace(/\/+$/, "");
  return base ? `${base}${path}` : path;
}

function logNotifyError(key: string, err: unknown): void {
  const name = err instanceof Error ? err.name : "Error";
  console.error(`[notify] send failed key=${key} ${name}`);
}

/**
 * Send a push at most once. Claims the dedupeKey by inserting NotificationLog
 * FIRST; a unique-violation means it was already sent, so we skip. If the send
 * itself throws, the just-claimed row is removed so the next run retries.
 */
async function notifyOnce(
  dedupeKey: string,
  kind: string,
  payload: NtfyPayload,
  send: (payload: NtfyPayload) => Promise<void>,
): Promise<boolean> {
  try {
    await prisma.notificationLog.create({ data: { dedupeKey, kind } });
  } catch (err) {
    if (isUniqueViolation(err)) return false; // already sent
    throw err;
  }
  try {
    await send(payload);
  } catch (err) {
    // Un-claim so a later run can retry; ignore a delete race.
    await prisma.notificationLog.delete({ where: { dedupeKey } }).catch(() => {});
    throw err;
  }
  return true;
}

interface LargeTxn {
  id: string;
  abs: string; // positive 2dp
  currency: string;
  date: string; // YYYY-MM-DD
  categoryName: string | null;
}

/** Recent outflows whose absolute amount exceeds the threshold (not transfers). */
async function scanLargeTransactions(
  threshold: Prisma.Decimal,
  now: Date,
  tz: string,
): Promise<LargeTxn[]> {
  const todayStart = zonedDayStart(now, tz);
  const from = zonedDateString(
    addDaysToDayStart(todayStart, -LARGE_TXN_WINDOW_DAYS, tz),
    tz,
  );
  const upper = zonedDateString(addDaysToDayStart(todayStart, 1, tz), tz);

  const rows = await prisma.$queryRaw<
    Array<{
      id: string;
      amount: string;
      currency: string;
      bookingDate: Date | string;
      categoryName: string | null;
    }>
  >(Prisma.sql`
    SELECT t.id, t.amount::text AS amount, t.currency,
           t."bookingDate", c.name AS "categoryName"
    FROM "Transaction" t
    LEFT JOIN "Category" c ON c.id = t."categoryId"
    WHERE t."isInternalTransfer" = false
      AND t.amount < 0
      AND abs(t.amount) > ${threshold.toFixed(2)}::numeric(12,2)
      AND t."bookingDate" >= ${from}::date
      AND t."bookingDate" <  ${upper}::date
    ORDER BY t."bookingDate" DESC, t.id
  `);

  return rows.map((r) => ({
    id: r.id,
    abs: new Prisma.Decimal(r.amount).abs().toFixed(2),
    currency: r.currency,
    date:
      r.bookingDate instanceof Date
        ? r.bookingDate.toISOString().slice(0, 10)
        : String(r.bookingDate).slice(0, 10),
    categoryName: r.categoryName,
  }));
}

async function runBudgetAlerts(
  send: (payload: NtfyPayload) => Promise<void>,
  now: Date,
  tz: string,
): Promise<number> {
  const { budgets } = await listBudgetsWithProgress(now, tz);
  let sent = 0;
  for (const b of budgets) {
    for (const threshold of crossedThresholds(Number(b.spent), Number(b.limit))) {
      const key = budgetDedupeKey(b.id, b.month, threshold);
      const payload: NtfyPayload = {
        title: `Budget ${threshold}%: ${b.categoryName}`,
        message: `${b.categoryName} at ${threshold}% of budget — €${b.spent} of €${b.limit} this month.`,
        priority: threshold === 100 ? 4 : 3,
        tags: threshold === 100 ? ["rotating_light"] : ["chart_with_upwards_trend"],
        click: appUrl("/budgets"),
      };
      try {
        if (await notifyOnce(key, "budget", payload, send)) sent++;
      } catch (err) {
        logNotifyError(key, err);
      }
    }
  }
  return sent;
}

async function runLargeTxnAlerts(
  send: (payload: NtfyPayload) => Promise<void>,
  now: Date,
  tz: string,
): Promise<number> {
  const threshold = await getLargeTxnThreshold();
  const large = await scanLargeTransactions(threshold, now, tz);
  let sent = 0;
  for (const tx of large) {
    const key = `large_txn:${tx.id}`;
    const where = tx.categoryName ? `in ${tx.categoryName}` : "(uncategorized)";
    const payload: NtfyPayload = {
      // Title stays ASCII (ntfy header constraint); the euro sign lives in the body.
      title: `Large transaction: ${tx.abs} EUR`,
      message: `A €${tx.abs} payment ${where} was booked on ${tx.date}.`,
      priority: 4,
      tags: ["money_with_wings"],
      click: appUrl("/transactions"),
    };
    try {
      if (await notifyOnce(key, "large_txn", payload, send)) sent++;
    } catch (err) {
      logNotifyError(key, err);
    }
  }
  return sent;
}

async function runSyncHealthReminders(
  send: (payload: NtfyPayload) => Promise<void>,
  now: Date,
  tz: string,
): Promise<number> {
  const conns = await prisma.bankConnection.findMany({
    where: {
      status: { in: [ConnectionStatus.AUTHORIZED, ConnectionStatus.EXPIRED] },
    },
  });
  let sent = 0;
  for (const c of conns) {
    const health = evaluateSyncHealth(
      {
        id: c.id,
        validUntil: c.validUntil,
        lastSyncedAt: c.lastSyncedAt,
        consecutiveFailures: c.consecutiveFailures,
        status: c.status,
      },
      now,
      tz,
    );
    if (!health.shouldAlert || !health.dedupeKey) continue;

    const label = c.aspspName || c.bank;
    const detail =
      health.reason === "failing"
        ? `${c.consecutiveFailures} bank syncs have failed in a row.`
        : health.daysOfValidity !== null && health.daysOfValidity <= 0
          ? `Bank consent for ${label} has expired.`
          : `Bank consent for ${label} expires in ${health.daysOfValidity} day(s).`;
    const payload: NtfyPayload = {
      title: `Reconnect ${label}`,
      message: `${detail} Re-consent in Settings to keep syncing.`,
      priority: 4,
      tags: ["warning"],
      click: appUrl("/settings"),
    };
    try {
      if (await notifyOnce(health.dedupeKey, "sync_health", payload, send)) sent++;
    } catch (err) {
      logNotifyError(health.dedupeKey, err);
    }
  }
  return sent;
}

/** The nightly entrypoint (registered in instrumentation.ts). */
export async function runNightlyNotifications(
  deps: NotifyDeps = {},
): Promise<NotifyResult> {
  const now = deps.now ?? new Date();
  const tz = deps.timeZone ?? DEFAULT_TIMEZONE;
  const send = deps.send ?? sendNtfy;

  const budgetAlerts = await runBudgetAlerts(send, now, tz);
  const largeTxnAlerts = await runLargeTxnAlerts(send, now, tz);
  const syncHealthAlerts = await runSyncHealthReminders(send, now, tz);

  console.info(
    `[notify] done budget=${budgetAlerts} large=${largeTxnAlerts} sync=${syncHealthAlerts}`,
  );
  return { budgetAlerts, largeTxnAlerts, syncHealthAlerts };
}
