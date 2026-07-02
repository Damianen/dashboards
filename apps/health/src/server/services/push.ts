import { sendNotification, setVapidDetails, WebPushError } from "web-push";

import type { NotificationMessage } from "@/lib/notifications";
import type { PushSubscriptionInput } from "@/lib/schemas/push";
import { prisma } from "@/server/db";

// Push messages are timely (a nudge, a failing-sync alert): if the device is
// offline for an hour the message is stale, so let the push service drop it.
const TTL_SECONDS = 60 * 60;
// A subscription that fails this many consecutive non-gone sends is pruned.
const MAX_FAILURES = 5;

// Configure VAPID once at module load. Guarded on the env so importing this
// module never throws when the keys aren't set (e.g. during build); push simply
// no-ops until the keys are provided. sendToAll checks the same flag — with no
// VAPID config every send would throw locally, and those failures must never
// count against the stored subscriptions.
const subject = process.env.VAPID_SUBJECT;
const publicKey = process.env.VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;
const pushConfigured = Boolean(subject && publicKey && privateKey);
if (subject && publicKey && privateKey) {
  setVapidDetails(subject, publicKey, privateKey);
} else {
  console.warn("[push] VAPID keys missing — push notifications are disabled");
}

/** Upsert a browser subscription, keyed on its endpoint; re-subscribing clears past failures. */
export async function saveSubscription(
  input: PushSubscriptionInput,
): Promise<void> {
  await prisma.pushSubscription.upsert({
    where: { endpoint: input.endpoint },
    create: {
      endpoint: input.endpoint,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
    },
    update: {
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
      failCount: 0,
    },
  });
}

/** Drop a subscription by endpoint (idempotent — a missing row is fine). */
export async function removeSubscription(endpoint: string): Promise<void> {
  await prisma.pushSubscription.deleteMany({ where: { endpoint } });
}

export interface PushSendResult {
  sent: number;
  removed: number;
}

/**
 * Deliver one message to every stored subscription. Self-healing, but only on
 * the push service's word: a 404/410 (the browser dropped the subscription)
 * prunes the row immediately, and any other WebPushError bumps fail_count and
 * prunes at MAX_FAILURES. A local/config failure (unset VAPID keys, a coding
 * error) says nothing about the subscription, so it is logged and the row left
 * untouched — a misconfigured env must never wipe subscriptions that would work
 * fine once the config is fixed. Runs all sends with allSettled so one bad
 * endpoint can't block the rest, and never throws.
 */
export async function sendToAll(
  message: NotificationMessage,
): Promise<PushSendResult> {
  if (!pushConfigured) return { sent: 0, removed: 0 };

  const subs = await prisma.pushSubscription.findMany();
  const payload = JSON.stringify(message);
  let sent = 0;
  let removed = 0;

  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payload,
          { TTL: TTL_SECONDS },
        );
        sent++;
        if (sub.failCount > 0) {
          await prisma.pushSubscription.updateMany({
            where: { endpoint: sub.endpoint },
            data: { failCount: 0 },
          });
        }
      } catch (err) {
        if (!(err instanceof WebPushError)) {
          console.error("[push] send failed locally (subscription kept)", err);
          return;
        }
        const gone = err.statusCode === 404 || err.statusCode === 410;
        if (gone || sub.failCount + 1 >= MAX_FAILURES) {
          await prisma.pushSubscription.deleteMany({
            where: { endpoint: sub.endpoint },
          });
          removed++;
        } else {
          await prisma.pushSubscription.updateMany({
            where: { endpoint: sub.endpoint },
            data: { failCount: { increment: 1 } },
          });
        }
      }
    }),
  );

  return { sent, removed };
}
