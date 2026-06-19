"use client";

import { RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { relativeTimeFromNow } from "@/lib/format";
import { useSyncAll } from "@/lib/hooks/use-sync-all";
import { useSyncProvider } from "@/lib/hooks/use-sync-provider";
import {
  type SyncStatusEntry,
  useSyncStatus,
} from "@/lib/hooks/use-sync-status";

// Maps the SyncSource enum (as it arrives over JSON) to its label and the provider slug
// the per-source /api/sync/{provider} route + useSyncProvider expect.
const SOURCE_META: Record<string, { label: string; provider: string }> = {
  OURA: { label: "Oura", provider: "oura" },
  WITHINGS: { label: "Withings", provider: "withings" },
};

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

function syncBadge(entry: SyncStatusEntry): {
  label: string;
  variant: BadgeVariant;
} {
  const run = entry.lastRun;
  if (!run) return { label: "Never", variant: "outline" };
  if (run.status === "RUNNING") return { label: "Syncing…", variant: "secondary" };
  if (run.status === "ERROR") return { label: "Error", variant: "destructive" };
  return {
    label: `OK · ${relativeTimeFromNow(run.finishedAt ?? run.startedAt)}`,
    variant: "default",
  };
}

function SyncRow({ entry }: { entry: SyncStatusEntry }) {
  const meta = SOURCE_META[entry.source] ?? {
    label: entry.source,
    provider: entry.source.toLowerCase(),
  };
  const sync = useSyncProvider(meta.provider, meta.label);
  const badge = syncBadge(entry);
  const run = entry.lastRun;
  const items = run
    ? `${run.itemsUpserted} item${run.itemsUpserted === 1 ? "" : "s"}`
    : "—";

  return (
    <div className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{meta.label}</span>
          <Badge variant={badge.variant}>{badge.label}</Badge>
        </div>
        <p className="text-muted-foreground truncate text-xs">
          {entry.cadence} · {items}
        </p>
        {run?.status === "ERROR" && run.error && (
          <p className="text-destructive truncate text-xs">{run.error}</p>
        )}
      </div>
      <Button
        size="icon"
        variant="ghost"
        onClick={() => sync.mutate()}
        disabled={sync.isPending}
        aria-label={`Sync ${meta.label}`}
      >
        <RefreshCw className={sync.isPending ? "animate-spin" : undefined} />
      </Button>
    </div>
  );
}

/** Consolidated sync health for every source: status badge, last-run items, and triggers. */
export function SyncStatusCard() {
  const { data, isLoading, isError, refetch, isFetching } = useSyncStatus();
  const syncAll = useSyncAll();

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-muted-foreground text-sm font-medium">Sync</h2>
        <Button
          variant="outline"
          size="sm"
          onClick={() => syncAll.mutate()}
          disabled={syncAll.isPending}
        >
          <RefreshCw className={syncAll.isPending ? "animate-spin" : undefined} />
          Sync all
        </Button>
      </div>
      {isLoading ? (
        <Skeleton className="h-44 w-full rounded-xl" />
      ) : isError ? (
        <div className="space-y-3 py-6 text-center">
          <p className="text-muted-foreground text-sm">
            Couldn&apos;t load sync status.
          </p>
          <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
            Retry
          </Button>
        </div>
      ) : (
        <Card>
          <CardContent className="divide-border divide-y">
            {(data ?? []).map((entry) => (
              <SyncRow key={entry.source} entry={entry} />
            ))}
          </CardContent>
        </Card>
      )}
    </section>
  );
}
