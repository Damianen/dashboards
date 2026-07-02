// The service worker's document fallback (sw.ts `fallbacks`): shown on a cold
// load of any uncached page while offline. Outside the (app) group on purpose —
// the nav and FAB are dead without a network anyway. Static, no client JS.
export default function OfflinePage() {
  return (
    <main className="min-h-dvh px-6 pt-[max(env(safe-area-inset-top),4rem)]">
      <div className="mx-auto w-full max-w-md space-y-4">
        <h1 className="text-xl font-semibold">You&apos;re offline</h1>
        <p className="text-muted-foreground text-sm">
          This page isn&apos;t cached. Reconnect and try again.
        </p>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- deliberate
            full-page load: a client-side <Link> nav can't fetch while offline;
            retrying means hitting the network (or the SW cache) from scratch. */}
        <a
          href="/"
          className="bg-primary text-primary-foreground inline-flex min-h-11 items-center justify-center rounded-md px-6 text-sm font-medium"
        >
          Retry
        </a>
      </div>
    </main>
  );
}
