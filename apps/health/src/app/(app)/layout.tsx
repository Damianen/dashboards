import { Suspense } from "react";

import { BottomNav } from "@/components/shell/bottom-nav";
import {
  QuickLogFab,
  QuickLogFabFallback,
} from "@/components/shell/quick-log-fab";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh">
      {/* Bottom padding clears the fixed nav + the bottom-right FAB. The FAB's
          top edge sits at safe-area + 8rem, so the clearance must track the
          inset too — a static value overlaps content on notched devices. */}
      <main className="mx-auto w-full max-w-md px-4 pt-[max(env(safe-area-inset-top),1.5rem)] pb-[calc(env(safe-area-inset-bottom)+9rem)]">
        {children}
      </main>
      {/* Suspense: the FAB reads useSearchParams (PWA shortcut deep link).
          The inert lookalike keeps it in the prerendered shell — no pop-in. */}
      <Suspense fallback={<QuickLogFabFallback />}>
        <QuickLogFab />
      </Suspense>
      <BottomNav />
    </div>
  );
}
