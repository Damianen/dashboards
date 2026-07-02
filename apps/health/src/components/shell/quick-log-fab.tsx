"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";

import { QuickLogDrawer } from "@/components/quick-log/quick-log-drawer";

/* Anchored bottom-right above the nav (56px bar + 16px gap) so it never
   covers a tab; aligned to the app's max-w-md column. */
const WRAPPER_CLASS = "pointer-events-none fixed inset-x-0 bottom-0 z-50";
const WRAPPER_STYLE = {
  paddingBottom: "calc(env(safe-area-inset-bottom) + 4.5rem)",
} as const;
const BUTTON_CLASS =
  "pointer-events-auto bg-primary text-primary-foreground ring-background flex size-14 items-center justify-center rounded-full shadow-lg ring-4 transition-transform active:scale-95";

/** Inert lookalike served as the Suspense fallback (and thus in the prerendered
 *  shell), so the FAB doesn't pop in at hydration. */
export function QuickLogFabFallback() {
  return (
    <div className={WRAPPER_CLASS} style={WRAPPER_STYLE} aria-hidden>
      <div className="mx-auto flex w-full max-w-md justify-end px-4">
        <div className={BUTTON_CLASS}>
          <Plus className="size-7" aria-hidden />
        </div>
      </div>
    </div>
  );
}

export function QuickLogFab() {
  // PWA-shortcut deep link: /?quick=water|stimulant|weight opens the drawer on
  // that segment. Read via lazy initial state — never a setState-in-effect.
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const quick = searchParams.get("quick");
  const quickSegment =
    quick === "water" || quick === "stimulant" || quick === "weight"
      ? quick
      : undefined;
  const [open, setOpen] = useState(() => quickSegment !== undefined);

  // Consume the shortcut param: without this, a pull-to-refresh (or session
  // restore) at /?quick=… re-opens a drawer the user already dismissed. URL
  // cleanup only — no state updates, so the setState-in-effect rule holds.
  useEffect(() => {
    if (quickSegment !== undefined) {
      window.history.replaceState(null, "", pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once, on mount
  }, []);

  return (
    <>
      <div className={WRAPPER_CLASS} style={WRAPPER_STYLE}>
        <div className="mx-auto flex w-full max-w-md justify-end px-4">
          <button
            type="button"
            aria-label="Quick log"
            onClick={() => setOpen(true)}
            className={BUTTON_CLASS}
          >
            <Plus className="size-7" aria-hidden />
          </button>
        </div>
      </div>
      <QuickLogDrawer
        open={open}
        onOpenChange={setOpen}
        initialSegment={quickSegment}
      />
    </>
  );
}
