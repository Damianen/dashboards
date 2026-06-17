"use client";

import { Bell, Send } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
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
import { postJSON } from "@/lib/fetcher";
import {
  disablePush,
  enablePush,
  getSubscriptionState,
  isPushSupported,
  isStandalone,
  type PushState,
} from "@/lib/push-client";

type Busy = "enable" | "test" | "disable" | null;

// Read a browser-only capability without a synchronous setState-in-effect:
// useSyncExternalStore serves the SSR snapshot (false) and swaps in the real
// value after hydration with no mismatch warning. The capability never changes,
// so subscribe is a no-op.
const subscribeNoop = () => () => {};
function useClientFlag(getSnapshot: () => boolean): boolean {
  return useSyncExternalStore(subscribeNoop, getSnapshot, () => false);
}

export function NotificationsCard() {
  const supported = useClientFlag(isPushSupported);
  const standalone = useClientFlag(isStandalone);
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState<Busy>(null);

  useEffect(() => {
    if (!supported) return;
    void getSubscriptionState()
      .then(setState)
      .catch(() => setState(null));
  }, [supported]);

  async function refresh() {
    try {
      setState(await getSubscriptionState());
    } catch {
      setState(null);
    }
  }

  async function handleEnable() {
    setBusy("enable");
    try {
      await enablePush();
      toast.success("Notifications enabled");
    } catch (err) {
      toast.error("Couldn't enable notifications", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      await refresh();
      setBusy(null);
    }
  }

  async function handleTest() {
    setBusy("test");
    try {
      const { sent } = await postJSON<{ sent: number; removed: number }>(
        "/api/push/test",
        {},
      );
      if (sent === 0) toast.error("No subscribed devices to notify");
      else toast.success(`Test sent to ${sent} device${sent === 1 ? "" : "s"}`);
    } catch {
      toast.error("Couldn't send test notification");
    } finally {
      setBusy(null);
    }
  }

  async function handleDisable() {
    setBusy("disable");
    try {
      await disablePush();
      toast.success("Notifications disabled");
    } catch {
      toast.error("Couldn't disable notifications");
    } finally {
      await refresh();
      setBusy(null);
    }
  }

  const subscribed = state?.subscribed ?? false;
  const denied = state?.permission === "denied";

  const badge = !supported
    ? { label: "Unsupported", variant: "outline" as const }
    : denied
      ? { label: "Blocked", variant: "destructive" as const }
      : subscribed
        ? { label: "Enabled", variant: "default" as const }
        : { label: "Off", variant: "secondary" as const };

  return (
    <section className="space-y-3">
      <h2 className="text-muted-foreground text-sm font-medium">Notifications</h2>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="size-4" /> Push notifications
          </CardTitle>
          <CardDescription>
            Water nudges, sync alerts, and a weekly summary.
          </CardDescription>
          <CardAction>
            <Badge variant={badge.variant}>{badge.label}</Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-3">
          {!supported ? (
            <p className="text-muted-foreground text-sm">
              This browser doesn&apos;t support push notifications.
            </p>
          ) : (
            <>
              {!standalone && (
                <p className="text-muted-foreground text-sm">
                  On iPhone, install this app to your Home Screen first (Share →
                  Add to Home Screen), then enable notifications.
                </p>
              )}
              {denied && (
                <p className="text-muted-foreground text-sm">
                  Notifications are blocked in your browser settings — re-allow
                  them for this site to enable.
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => void handleEnable()}
                  disabled={busy !== null || subscribed || denied}
                >
                  {subscribed ? "Enabled" : "Enable"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => void handleTest()}
                  disabled={busy !== null || !subscribed}
                >
                  <Send /> Send test
                </Button>
                {subscribed && (
                  <Button
                    variant="destructive"
                    onClick={() => void handleDisable()}
                    disabled={busy !== null}
                  >
                    Disable
                  </Button>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
