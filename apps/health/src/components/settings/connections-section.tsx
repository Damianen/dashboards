"use client";

import { useEffect } from "react";
import { Plug } from "lucide-react";
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

const BLURB: Record<Connection["provider"], string> = {
  withings: "Body weight & composition",
  oura: "Sleep & readiness",
};

// OAuth providers expose a connect link; the server sets the state cookie on this nav.
const AUTHORIZE_PATH: Partial<Record<Connection["provider"], string>> = {
  withings: "/api/oauth/withings",
  oura: "/api/oauth/oura",
};

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

function statusBadge(c: Connection): { label: string; variant: BadgeVariant } {
  if (c.needsReauth) return { label: "Needs re-auth", variant: "destructive" };
  if (c.kind === "unavailable")
    return { label: "Not yet available", variant: "secondary" };
  if (!c.connected) return { label: "Not connected", variant: "outline" };
  return { label: c.kind === "pat" ? "Configured" : "Connected", variant: "default" };
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
  const badge = statusBadge(c);
  const expiry = expiryText(c);
  const authorizePath = AUTHORIZE_PATH[c.provider];
  const hasContent = Boolean(expiry || authorizePath || c.kind === "unavailable");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{c.label}</CardTitle>
        <CardDescription>{BLURB[c.provider]}</CardDescription>
        <CardAction>
          <Badge variant={badge.variant}>{badge.label}</Badge>
        </CardAction>
      </CardHeader>
      {hasContent && (
        <CardContent className="space-y-3">
          {expiry && <p className="text-muted-foreground text-xs">{expiry}</p>}
          {(authorizePath || c.kind === "unavailable") && (
            <div className="flex flex-wrap gap-2">
              {authorizePath && (
                // Full navigation (not fetch) so the server can set the state cookie.
                <Button asChild variant={c.connected ? "outline" : "default"}>
                  <a href={authorizePath}>
                    <Plug />
                    {c.connected ? "Reconnect" : "Connect"}
                  </a>
                </Button>
              )}
              {c.kind === "unavailable" && (
                <Button variant="outline" disabled>
                  Coming soon
                </Button>
              )}
            </div>
          )}
        </CardContent>
      )}
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
