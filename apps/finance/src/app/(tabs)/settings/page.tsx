import { Landmark } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SyncButton } from "@/components/sync-button";
import { Bank, ConnectionStatus } from "@/generated/prisma/client";
import { startConnect } from "@/server/actions/connections";
import { getBankStatuses, type BankStatus } from "@/server/services/connections";
import { ebConfig, isConfigured } from "@/server/services/enable-banking/config";

export const dynamic = "force-dynamic";

const BANK_LABELS: Record<Bank, string> = {
  [Bank.ING]: "ING",
  [Bank.REVOLUT]: "Revolut",
};

const dateFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Amsterdam",
  day: "2-digit",
  month: "short",
  year: "numeric",
});

function statusBadge(status: BankStatus["status"]): {
  label: string;
  variant: "default" | "secondary" | "destructive" | "outline";
} {
  switch (status) {
    case ConnectionStatus.AUTHORIZED:
      return { label: "Connected", variant: "default" };
    case ConnectionStatus.PENDING:
      return { label: "Pending…", variant: "secondary" };
    case ConnectionStatus.EXPIRED:
      return { label: "Expired", variant: "destructive" };
    case ConnectionStatus.ERROR:
      return { label: "Error", variant: "destructive" };
    default:
      return { label: "Not connected", variant: "outline" };
  }
}

function daysLeft(validUntil: Date): number {
  return Math.ceil((validUntil.getTime() - Date.now()) / 86_400_000);
}

const ERROR_MESSAGES: Record<string, string> = {
  denied: "Authorization was cancelled at the bank.",
  bad_bank: "Unknown bank.",
  not_configured:
    "Enable Banking isn’t configured. Set EB_APP_ID and the private key first.",
  connect_failed: "Couldn’t start the bank authorization. Check the logs.",
  callback_failed: "The bank redirect couldn’t be completed. Try again.",
  missing_params: "The bank redirect was missing its code.",
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const statuses = await getBankStatuses();
  const configured = isConfigured();
  const { sandbox } = ebConfig();

  const connected =
    typeof params.connected === "string" ? params.connected : null;
  const errorKey = typeof params.error === "string" ? params.error : null;

  return (
    <section className="flex flex-col gap-4 py-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Bank connections{sandbox ? " · sandbox (Mock ASPSP)" : ""}
        </p>
      </header>

      {connected && (
        <p className="rounded-lg border border-border bg-muted px-3 py-2 text-sm">
          Connected to {BANK_LABELS[connected as Bank] ?? connected}.
        </p>
      )}
      {errorKey && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {ERROR_MESSAGES[errorKey] ?? "Something went wrong."}
        </p>
      )}
      {!configured && (
        <p className="rounded-lg border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
          Enable Banking isn’t configured yet. Add <code>EB_APP_ID</code> and
          point <code>EB_PRIVATE_KEY_PATH</code> at your <code>.pem</code> to
          connect a bank.
        </p>
      )}

      <ul className="flex flex-col gap-3">
        {statuses.map((s) => {
          const badge = statusBadge(s.status);
          const isConnected = s.status === ConnectionStatus.AUTHORIZED;
          return (
            <li
              key={s.bank}
              className="flex flex-col gap-3 rounded-xl border border-border p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Landmark className="size-5 text-muted-foreground" aria-hidden />
                  <span className="font-medium">{BANK_LABELS[s.bank]}</span>
                </div>
                <Badge variant={badge.variant}>{badge.label}</Badge>
              </div>

              <dl className="grid grid-cols-2 gap-1 text-sm text-muted-foreground">
                {isConnected && s.validUntil && (
                  <div className="col-span-2 flex justify-between">
                    <dt>Consent valid until</dt>
                    <dd className="text-foreground">
                      {dateFmt.format(s.validUntil)} ({daysLeft(s.validUntil)}d
                      left)
                    </dd>
                  </div>
                )}
                {isConnected && (
                  <div className="col-span-2 flex justify-between">
                    <dt>Accounts</dt>
                    <dd className="text-foreground">{s.accountCount}</dd>
                  </div>
                )}
                <div className="col-span-2 flex justify-between">
                  <dt>Last synced</dt>
                  <dd className="text-foreground">
                    {s.lastSyncedAt ? dateFmt.format(s.lastSyncedAt) : "never"}
                  </dd>
                </div>
                {s.lastError && s.status !== ConnectionStatus.AUTHORIZED && (
                  <div className="col-span-2 flex justify-between">
                    <dt>Last error</dt>
                    <dd className="text-destructive">{s.lastError}</dd>
                  </div>
                )}
              </dl>

              <form action={startConnect}>
                <input type="hidden" name="bank" value={s.bank} />
                <Button
                  type="submit"
                  variant={isConnected ? "outline" : "default"}
                  size="lg"
                  disabled={!configured}
                  className="w-full"
                >
                  {isConnected ? `Reconnect ${BANK_LABELS[s.bank]}` : `Connect ${BANK_LABELS[s.bank]}`}
                </Button>
              </form>
            </li>
          );
        })}
      </ul>

      <div className="border-t border-border pt-4">
        <SyncButton />
      </div>
    </section>
  );
}
