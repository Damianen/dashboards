// Withings API client. Auth is rotating OAuth (unlike Oura's static PAT): tokens are
// stored AES-256-GCM-encrypted via the tokens service, and refresh tokens are
// SINGLE-USE — getAccessToken() rotates and persists the new pair before handing back
// the access token, serialized behind one in-process lock so two concurrent syncs can
// never spend the same refresh token. This file is the I/O + token boundary; it returns
// plain typed records (and Prisma row inputs) and only touches the DB via the tokens
// service. The Withings quirk: every call returns HTTP 200 — success is body.status === 0
// and the payload sits in body.body.

import { Prisma, OauthProvider, Source } from "@/generated/prisma/client";
import { dayOf, dayToDbDate } from "@/lib/dates";
import { DomainError } from "@/server/services/errors";
import {
  getTokens,
  type OauthTokens,
  saveTokens,
} from "@/server/services/tokens";

const AUTHORIZE_URL = "https://account.withings.com/oauth2_user/authorize2";
const TOKEN_URL = "https://wbsapi.withings.net/v2/oauth2";
const MEASURE_URL = "https://wbsapi.withings.net/measure";
const SCOPE = "user.metrics";
const TIMEOUT_MS = 10_000;
// Refresh proactively if the access token expires within this margin.
const REFRESH_SKEW_MS = 2 * 60 * 1000;

/**
 * A re-auth signal: the Withings connection is missing or its (single-use) refresh
 * token was rejected. A DomainError so the route/MCP mappers render its message; the
 * sync service catches it to close the run as "needs re-auth" without crashing.
 */
export class WithingsAuthError extends DomainError {}

function clientId(): string {
  const v = process.env.WITHINGS_CLIENT_ID;
  if (!v) throw new Error("WITHINGS_CLIENT_ID is not set");
  return v;
}

function clientSecret(): string {
  const v = process.env.WITHINGS_CLIENT_SECRET;
  if (!v) throw new Error("WITHINGS_CLIENT_SECRET is not set");
  return v;
}

function redirectUri(): string {
  const v = process.env.WITHINGS_REDIRECT_URI;
  if (!v) throw new Error("WITHINGS_REDIRECT_URI is not set");
  return v;
}

/** The consent URL to send the user to. `state` is the CSRF token we verify on callback. */
export function authorizeUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId(),
    scope: SCOPE,
    redirect_uri: redirectUri(),
    state,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

// ----- token endpoint -----

interface WithingsEnvelope<T> {
  status: number;
  body: T;
  error?: string;
}

interface WithingsTokenBody {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope?: string;
}

/** Map a token-endpoint body to our token set; expiresAt is `now + expires_in`. Pure. */
export function parseTokenBody(
  body: WithingsTokenBody,
  now: number,
): OauthTokens {
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: new Date(now + body.expires_in * 1000),
    scope: body.scope ?? null,
  };
}

/** Unwrap a token-endpoint envelope; any non-zero status is a re-auth failure. */
function unwrapToken(json: unknown): WithingsTokenBody {
  const env = json as WithingsEnvelope<WithingsTokenBody>;
  if (env.status !== 0) {
    throw new WithingsAuthError(
      `Withings token request rejected (status ${env.status}` +
        `${env.error ? `: ${env.error}` : ""})`,
    );
  }
  return env.body;
}

async function tokenRequest(
  params: Record<string, string>,
): Promise<OauthTokens> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        action: "requesttoken",
        client_id: clientId(),
        client_secret: clientSecret(),
        ...params,
      }).toString(),
      cache: "no-store",
      signal: controller.signal,
    });
    // Withings returns 200 even for auth failures; the real status is in the body.
    if (!res.ok) throw new Error(`Withings token HTTP ${res.status}`);
    return parseTokenBody(unwrapToken(await res.json()), Date.now());
  } finally {
    clearTimeout(timer);
  }
}

/** Exchange an authorization code (OAuth callback) for the initial token pair. */
export function exchangeCode(code: string): Promise<OauthTokens> {
  return tokenRequest({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri(),
  });
}

// Serializes refreshes so concurrent callers share one in-flight refresh (and thus one
// spend of the single-use refresh token) rather than racing to spend it twice.
let refreshLock: Promise<string> | null = null;

/**
 * A valid Withings access token, refreshing first if it expires within REFRESH_SKEW_MS.
 * Throws WithingsAuthError if Withings isn't connected or the refresh token is rejected.
 * The rotated pair is persisted BEFORE the new access token is returned.
 */
export async function getAccessToken(): Promise<string> {
  const tokens = await getTokens(OauthProvider.WITHINGS);
  if (!tokens) throw new WithingsAuthError("Withings is not connected");
  if (tokens.expiresAt.getTime() - Date.now() > REFRESH_SKEW_MS) {
    return tokens.accessToken;
  }
  // First caller installs the lock; concurrent callers await the same refresh.
  if (!refreshLock) {
    refreshLock = refreshAccessToken(tokens.refreshToken).finally(() => {
      refreshLock = null;
    });
  }
  return refreshLock;
}

async function refreshAccessToken(refreshToken: string): Promise<string> {
  let rotated: OauthTokens;
  try {
    rotated = await tokenRequest({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });
  } catch (err) {
    if (err instanceof WithingsAuthError) throw err;
    // A transport/parse failure during refresh is also fatal to the connection.
    throw new WithingsAuthError(
      `Withings token refresh failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  // Persist the rotated pair before spending the access token: a crash here must never
  // strand us holding a refresh token we already consumed but failed to record.
  await saveTokens(OauthProvider.WITHINGS, rotated);
  return rotated.accessToken;
}

// ----- measurements -----

// Withings measure type codes. Real value = value * 10^unit.
const MEAS_WEIGHT = 1;
const MEAS_FAT_RATIO = 6;
const MEAS_MUSCLE = 76;
const MEAS_HYDRATION = 77;
const MEAS_BONE = 88;
const MEASTYPES = [
  MEAS_WEIGHT,
  MEAS_FAT_RATIO,
  MEAS_MUSCLE,
  MEAS_HYDRATION,
  MEAS_BONE,
].join(",");

export interface WithingsMeasure {
  value: number;
  type: number;
  unit: number;
}

export interface WithingsMeasureGroup {
  grpid: number;
  date: number; // unix seconds
  category: number;
  measures: WithingsMeasure[];
}

interface WithingsMeasureBody {
  measuregrps: WithingsMeasureGroup[];
}

/** Either an incremental `lastupdate` (epoch s) or an absolute backfill window. */
export type WithingsMeasureWindow =
  | { lastupdate: number }
  | { startdate: number; enddate: number };

/**
 * Fetch body-measurement groups for the window (category 1 = real measurements, not
 * user goals). Pulls a valid access token first (refreshing as needed). Non-zero
 * statuses surface as errors for the sync run to record.
 */
export async function getMeasurements(
  window: WithingsMeasureWindow,
): Promise<WithingsMeasureGroup[]> {
  const params = new URLSearchParams({
    action: "getmeas",
    meastypes: MEASTYPES,
    category: "1",
  });
  if ("lastupdate" in window) {
    params.set("lastupdate", String(window.lastupdate));
  } else {
    params.set("startdate", String(window.startdate));
    params.set("enddate", String(window.enddate));
  }

  const access = await getAccessToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${MEASURE_URL}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${access}` },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Withings measure HTTP ${res.status}`);
    const env = (await res.json()) as WithingsEnvelope<WithingsMeasureBody>;
    if (env.status !== 0) {
      throw new Error(
        `Withings getmeas failed (status ${env.status}` +
          `${env.error ? `: ${env.error}` : ""})`,
      );
    }
    return env.body.measuregrps;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fold measure groups into WeightMeasurement rows — one row per grpid, keyed by grpid as
 * externalId so re-syncs UPSERT idempotently. Each measure's real value is value*10^unit;
 * type codes map 1→weight, 6→body fat %, 76→muscle, 77→hydration, 88→bone. Groups with no
 * weight measure are skipped (weight_kg is non-null). The full group is kept in `raw`. Pure.
 */
export function groupMeasures(
  groups: WithingsMeasureGroup[],
): (Prisma.WeightMeasurementUncheckedCreateInput & { externalId: string })[] {
  const rows: (Prisma.WeightMeasurementUncheckedCreateInput & {
    externalId: string;
  })[] = [];
  for (const grp of groups) {
    const byType = new Map<number, number>();
    for (const m of grp.measures) {
      // First occurrence wins; a group doesn't normally repeat a type.
      if (!byType.has(m.type)) byType.set(m.type, m.value * 10 ** m.unit);
    }
    const weightKg = byType.get(MEAS_WEIGHT);
    if (weightKg == null) continue;
    const measuredAt = new Date(grp.date * 1000);
    rows.push({
      externalId: String(grp.grpid),
      measuredAt,
      day: dayToDbDate(dayOf(measuredAt)),
      weightKg,
      bodyFatPct: byType.get(MEAS_FAT_RATIO) ?? null,
      muscleMassKg: byType.get(MEAS_MUSCLE) ?? null,
      hydrationKg: byType.get(MEAS_HYDRATION) ?? null,
      boneMassKg: byType.get(MEAS_BONE) ?? null,
      source: Source.WITHINGS,
      raw: grp as unknown as Prisma.InputJsonValue,
    });
  }
  return rows;
}
