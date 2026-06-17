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
// no-ops until the keys are provided.
const subject = process.env.VAPID_SUBJECT;
const publicKey = process.env.VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;
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
 * Deliver one message to every stored subscription. Self-healing: a 404/410
 * (the browser dropped the subscription) prunes the row immediately; any other
 * send error bumps fail_count and prunes at MAX_FAILURES. Runs all sends with
 * allSettled so one bad endpoint can't block the rest, and never throws.
 */
export async function sendToAll(
  message: NotificationMessage,
): Promise<PushSendResult> {
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
        const gone =
          err instanceof WebPushError &&
          (err.statusCode === 404 || err.statusCode === 410);
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
