"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import { QuickLogDrawer } from "@/components/quick-log/quick-log-drawer";

export function QuickLogFab() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1.75rem)" }}
      >
        <button
          type="button"
          aria-label="Quick log"
          onClick={() => setOpen(true)}
          className="pointer-events-auto bg-primary text-primary-foreground ring-background flex size-14 items-center justify-center rounded-full shadow-lg ring-4 transition-transform active:scale-95"
        >
          <Plus className="size-7" aria-hidden />
        </button>
      </div>
      <QuickLogDrawer open={open} onOpenChange={setOpen} />
    </>
  );
}
