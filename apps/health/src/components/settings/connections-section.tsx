"use client";

import { useEffect } from "react";
import { Plug, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { type Connection, useConnections } from "@/lib/hooks/use-connections";
import { useSyncProvider } from "@/lib/hooks/use-sync-provider";

const BLURB: Record<Connection["provider"], string> = {
  withings: "Body weight & composition",
  oura: "Sleep & readiness",
  google: "Activity & steps",
};

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

function statusBadge(c: Connection): { label: string; variant: BadgeVariant } {
  if (c.needsReauth) return { label: "Needs re-auth", variant: "destructive" };
  if (c.kind === "unavailable")
    return { label: "Not yet available", variant: "secondary" };
  if (!c.connected) return { label: "Not connected", variant: "outline" };
  return { label: c.kind === "pat" ? "Configured" : "Connected", variant: "default" };
}

/** Dates arrive over JSON as strings; new Date() handles both. */
function formatWhen(d: Date | string): string {
  return new Date(d).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function lastRunText(c: Connection): string {
  if (!c.lastRun) return "Never synced";
  const { status, itemsUpserted, finishedAt, startedAt } = c.lastRun;
  const when = formatWhen(finishedAt ?? startedAt);
  if (status === "OK") {
    return `Last sync: ${itemsUpserted} item${itemsUpserted === 1 ? "" : "s"} · ${when}`;
  }
  if (status === "ERROR") return `Last sync failed · ${when}`;
  return `Syncing… · ${when}`;
}

function expiryText(c: Connection): string | null {
  if (c.kind !== "oauth" || !c.connected || !c.expiresAt) return null;
  const ms = new Date(c.expiresAt).getTime() - Date.now();
  if (ms <= 0) return "Access token expired — refreshes on next sync";
  const mins = Math.round(ms / 60_000);
  return mins < 60
    ? `Access token valid ~${mins} min`
    : `Access token valid ~${Math.round(mins / 60)} h`;
}

function ConnectionCard({ c }: { c: Connection }) {
  const sync = useSyncProvider(c.provider, c.label);
  const badge = statusBadge(c);
  const expiry = expiryText(c);
  const isWithings = c.provider === "withings";
  const canSync = c.kind !== "unavailable" && c.connected;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{c.label}</CardTitle>
        <CardDescription>{BLURB[c.provider]}</CardDescription>
        <CardAction>
          <Badge variant={badge.variant}>{badge.label}</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-muted-foreground space-y-0.5 text-xs">
          <p>{lastRunText(c)}</p>
          {expiry && <p>{expiry}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {isWithings && (
            // Full navigation (not fetch) so the server can set the state cookie.
            <Button asChild variant={c.connected ? "outline" : "default"}>
              <a href="/api/oauth/withings">
                <Plug />
                {c.connected ? "Reconnect" : "Connect"}
              </a>
            </Button>
          )}
          {canSync && (
            <Button
              variant={isWithings ? "secondary" : "default"}
              onClick={() => sync.mutate()}
              disabled={sync.isPending}
            >
              <RefreshCw className={sync.isPending ? "animate-spin" : undefined} />
              Sync now
            </Button>
          )}
          {c.kind === "unavailable" && (
            <Button variant="outline" disabled>
              Coming soon
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/** Surface the one-shot ?connected / ?error flag the OAuth callback set, then clear it. */
function useOauthResultToast() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");
    const error = params.get("error");
    if (!connected && !error) return;
    if (connected) {
      toast.success(`Connected ${titleize(connected)}`);
    } else if (error) {
      toast.error(`Couldn't connect ${titleize(error)}`, {
        description: "The authorization was cancelled or failed. Try again.",
      });
    }
    // Drop the query param so a refresh doesn't re-toast.
    window.history.replaceState(null, "", window.location.pathname);
  }, []);
}

function titleize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function ConnectionsSection() {
  useOauthResultToast();
  const { data, isLoading, isError, refetch, isFetching } = useConnections();

  return (
    <section className="space-y-3">
      <h2 className="text-muted-foreground text-sm font-medium">Connections</h2>
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-36 w-full rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <div className="space-y-3 py-6 text-center">
          <p className="text-muted-foreground text-sm">
            Couldn&apos;t load connections.
          </p>
          <Button
            variant="outline"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            Retry
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {(data ?? []).map((c) => (
            <ConnectionCard key={c.provider} c={c} />
          ))}
        </div>
      )}
    </section>
  );
}
