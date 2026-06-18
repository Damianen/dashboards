// Browser-only Web Push helpers used by the settings Notifications card. Server
// code never imports this; all the navigator/Notification access lives here.

import { getJSON, postJSON } from "@/lib/fetcher";

/** Whether this browser can do Web Push at all (Service Worker + Push + Notifications). */
export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** Whether the app is running as an installed PWA (iOS requires this for Web Push). */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone ===
      true
  );
}

/** Decode a base64url VAPID key into the Uint8Array `applicationServerKey` expects. */
export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export interface PushState {
  permission: NotificationPermission;
  subscribed: boolean;
}

/** Current permission + whether a push subscription already exists in the SW. */
export async function getSubscriptionState(): Promise<PushState> {
  const permission = Notification.permission;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  return { permission, subscribed: subscription !== null };
}

/**
 * Full enable flow — must be called from a user gesture: request permission,
 * fetch the server's VAPID public key, subscribe via the Service Worker, and
 * persist the subscription server-side.
 */
export async function enablePush(): Promise<void> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Notification permission was not granted");
  }
  const { publicKey } = await getJSON<{ publicKey: string | null }>(
    "/api/push/public-key",
  );
  if (!publicKey) throw new Error("Server has no VAPID public key configured");

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });
  await postJSON("/api/push/subscribe", subscription.toJSON());
}

/** Tear down the subscription both server-side and in the browser. */
export async function disablePush(): Promise<void> {
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;
  await postJSON("/api/push/unsubscribe", { endpoint: subscription.endpoint });
  await subscription.unsubscribe();
}
