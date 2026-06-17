import { z } from "zod";

// The shape the browser's PushSubscription serialises to (subscription.toJSON()).
// Single source of truth for the /api/push/subscribe route and the push service.
export const pushSubscriptionSchema = z.strictObject({
  endpoint: z.url(),
  expirationTime: z.number().nullable().optional(),
  keys: z.strictObject({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;

export const unsubscribeSchema = z.strictObject({
  endpoint: z.url(),
});
export type UnsubscribeInput = z.infer<typeof unsubscribeSchema>;
