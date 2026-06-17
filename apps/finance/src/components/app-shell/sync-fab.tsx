"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { syncNow } from "@/server/actions/sync";

// Floats above the tab bar. User-present "Sync now" — pulls fresh transactions
// from every connected bank, then refreshes the current route.
export function SyncFab() {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <Button
      size="icon"
      aria-label="Sync now"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await syncNow();
          router.refresh();
        })
      }
      className="fixed right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-50 size-14 rounded-full shadow-lg shadow-primary/30 transition-transform duration-150 active:scale-90"
    >
      <RefreshCw
        className={cn("size-6", pending && "animate-spin")}
        aria-hidden
      />
    </Button>
  );
}
