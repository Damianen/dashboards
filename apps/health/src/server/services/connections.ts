import {
  OauthProvider,
  type SyncRun,
  SyncSource,
  type SyncStatus,
} from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import { OURA_REAUTH_MSG } from "@/server/services/sync/oura";
import { latestRunsBySource } from "@/server/services/sync/runs";
import { WITHINGS_REAUTH_MSG } from "@/server/services/sync/withings";

export interface ConnectionLastRun {
  status: SyncStatus;
  startedAt: Date;
  finishedAt: Date | null;
  itemsUpserted: number;
  error: string | null;
}

export interface Connection {
  provider: "withings" | "oura";
  label: string;
  /** How it connects: rotating OAuth, a static PAT, or not yet available. */
  kind: "oauth" | "pat" | "unavailable";
  connected: boolean;
  /** OAuth access-token expiry (oauth providers only); never the token itself. */
  expiresAt: Date | null;
  needsReauth: boolean;
  lastRun: ConnectionLastRun | null;
}

function toLastRun(run: SyncRun | undefined): ConnectionLastRun | null {
  if (!run) return null;
  return {
    status: run.status,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    itemsUpserted: run.itemsUpserted,
    error: run.error,
  };
}

/**
 * Per-provider connection status for the Settings page. Reuses latestRunsBySource()
 * (the latest run per source) and reads only the oauth_tokens row's *existence and
 * expiry* — never the encrypted tokens. Withings `needsReauth` is derived from its
 * latest run failing with the stable re-auth marker, so no extra state is stored.
 */
export async function getConnections(): Promise<Connection[]> {
  const runs = await latestRunsBySource();
  const runBySource = new Map(runs.map((r) => [r.source, r]));

  // select narrows the read to expiry — the encrypted tokens never leave the DB here.
  const withingsToken = await prisma.oauthToken.findUnique({
    where: { provider: OauthProvider.WITHINGS },
    select: { expiresAt: true },
  });
  const withingsRun = runBySource.get(SyncSource.WITHINGS);

  const ouraToken = await prisma.oauthToken.findUnique({
    where: { provider: OauthProvider.OURA },
    select: { expiresAt: true },
  });
  const ouraRun = runBySource.get(SyncSource.OURA);

  return [
    {
      provider: "withings",
      label: "Withings",
      kind: "oauth",
      connected: withingsToken !== null,
      expiresAt: withingsToken?.expiresAt ?? null,
      needsReauth:
        withingsRun?.status === "ERROR" &&
        withingsRun?.error === WITHINGS_REAUTH_MSG,
      lastRun: toLastRun(withingsRun),
    },
    {
      provider: "oura",
      label: "Oura",
      kind: "oauth",
      connected: ouraToken !== null,
      expiresAt: ouraToken?.expiresAt ?? null,
      needsReauth:
        ouraRun?.status === "ERROR" && ouraRun?.error === OURA_REAUTH_MSG,
      lastRun: toLastRun(ouraRun),
    },
  ];
}
