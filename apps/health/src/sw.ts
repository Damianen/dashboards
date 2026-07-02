/// <reference lib="webworker" />
/// <reference types="@serwist/next/typings" />

import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

// `injectionPoint` is replaced at build time by the @serwist/next plugin with the
// precache manifest for the built assets.
declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
  // Offline cold load of an uncached page falls back to the precached offline
  // document (precached via additionalPrecacheEntries in next.config.ts).
  fallbacks: {
    entries: [
      {
        url: "/~offline",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});

serwist.addEventListeners();

// Web Push: the server sends { title, body, url }; show it as a notification and,
// on click, focus an already-open window or open one at the payload's url.
interface PushPayload {
  title?: string;
  body?: string;
  url?: string;
}

self.addEventListener("push", (event: PushEvent) => {
  let payload: PushPayload = {};
  try {
    payload = event.data?.json() ?? {};
  } catch {
    payload = { body: event.data?.text() };
  }
  const url = payload.url ?? "/";
  event.waitUntil(
    self.registration.showNotification(payload.title ?? "Health", {
      body: payload.body,
      data: { url },
      icon: "/icon-192.png",
      badge: "/icon-192.png",
    }),
  );
});

self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string } | null)?.url ?? "/";
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of clients) {
        if ("focus" in client) {
          await client.focus();
          try {
            // Actually take the focused window to the payload's url — focusing
            // alone left the user on whatever page happened to be open.
            if ("navigate" in client) await client.navigate(url);
          } catch {
            // navigate() rejects for uncontrolled clients — open a fresh one.
            await self.clients.openWindow(url);
          }
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
