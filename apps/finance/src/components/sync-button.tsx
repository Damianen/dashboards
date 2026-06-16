"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { syncNow } from "@/server/actions/sync";
import type { SyncSummary } from "@/server/services/sync";

function describe(summary: SyncSummary): string {
  switch (summary.status) {
    case "not-configured":
      return "Enable Banking isn’t configured yet.";
    case "no-connections":
      return "No connected banks yet.";
    default:
      return `Synced ${summary.inserted} new across ${summary.accounts} account(s).`;
  }
}

export function SyncButton() {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        variant="outline"
        size="lg"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const summary = await syncNow();
            setMessage(describe(summary));
            router.refresh();
          })
        }
      >
        <RefreshCw
          className={cn("size-4", pending && "animate-spin")}
          aria-hidden
        />
        Sync now
      </Button>
      {message && (
        <span className="text-sm text-muted-foreground">{message}</span>
      )}
    </div>
  );
}
