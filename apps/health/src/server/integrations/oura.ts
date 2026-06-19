// Oura v2 API client. Auth is standard OAuth2 (authorization code) since Oura retired
// Personal Access Tokens — tokens are stored AES-256-GCM-encrypted via the tokens service
// and getAccessToken() pre-emptively refreshes behind one in-process lock (same shape as
// Withings/Google) so two concurrent syncs never race a refresh. Oura rotates its refresh
// token on every refresh (single-use, like Withings), so the rotated pair is persisted
// BEFORE the new access token is returned. Unlike Withings, Oura is plain OAuth2: real HTTP
// status codes, client_id + client_secret in the form body, no request signing.
//
// Every collection endpoint takes start_date/end_date (YYYY-MM-DD) and paginates via an
// opaque `next_token`; we loop until it is null. This file is the I/O + token boundary: it
// returns plain typed records and only touches the DB via the tokens service.

import { OauthProvider } from "@/generated/prisma/client";
import { DomainError } from "@/server/services/errors";
import {
  getTokens,
  type OauthTokens,
  saveTokens,
} from "@/server/services/tokens";

const BASE = "https://api.ouraring.com";
const AUTHORIZE_URL = "https://cloud.ouraring.com/oauth/authorize";
const TOKEN_URL = "https://api.ouraring.com/oauth/token";
// Only the `daily` scope is needed: the sync pulls sleep, daily_sleep and daily_readiness,
// all covered by it (the HR/HRV fields live inside the sleep document, not a separate
// heartrate endpoint). Space-separated if more scopes are ever added.
const SCOPE = "daily";
const TIMEOUT_MS = 10_000;
// Refresh proactively if the access token expires within this margin.
const REFRESH_SKEW_MS = 2 * 60 * 1000;
// next_token is server-driven; a window of ~90 days yields a handful of pages. Cap the
// loop so a contract change that always returns a token can't spin forever.
const MAX_PAGES = 50;

/**
 * A re-auth signal: the Oura connection is missing or its (rotated) refresh token was
 * rejected. A DomainError so the route/MCP mappers render its message; the sync service
 * catches it to close the run as "needs re-auth" without crashing.
 */
export class OuraAuthError extends DomainError {}

function clientId(): string {
  const v = process.env.OURA_CLIENT_ID;
  if (!v) throw new Error("OURA_CLIENT_ID is not set");
  return v;
}

function clientSecret(): string {
  const v = process.env.OURA_CLIENT_SECRET;
  if (!v) throw new Error("OURA_CLIENT_SECRET is not set");
  return v;
}

function redirectUri(): string {
  const v = process.env.OURA_REDIRECT_URI;
  if (!v) throw new Error("OURA_REDIRECT_URI is not set");
  return v;
}

/** The consent URL to send the user to. `state` is the CSRF token we verify on callback. */
export function authorizeUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId(),
    redirect_uri: redirectUri(),
    scope: SCOPE,
    state,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

// ----- token endpoint -----

interface OuraTokenBody {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type?: string;
  scope?: string;
}

/** Map a token-endpoint body to our token set; expiresAt is `now + expires_in`. Pure. */
export function parseTokenBody(body: OuraTokenBody, now: number): OauthTokens {
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: new Date(now + body.expires_in * 1000),
    scope: body.scope ?? null,
  };
}

interface OuraTokenErrorBody {
  error?: string;
  error_description?: string;
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
        client_id: clientId(),
        client_secret: clientSecret(),
        ...params,
      }).toString(),
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) {
      // Oura uses real status codes (unlike Withings' always-200). A 4xx here means the
      // code/refresh token was rejected — a re-auth condition.
      const body = (await res.json().catch(() => ({}))) as OuraTokenErrorBody;
      const detail = body.error_description ?? body.error;
      throw new OuraAuthError(
        `Oura token request rejected (HTTP ${res.status}${detail ? `: ${detail}` : ""})`,
      );
    }
    return parseTokenBody((await res.json()) as OuraTokenBody, Date.now());
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
// spend of the rotated refresh token) rather than racing to spend it twice.
let refreshLock: Promise<string> | null = null;

/**
 * A valid Oura access token, refreshing first if it expires within REFRESH_SKEW_MS.
 * Throws OuraAuthError if Oura isn't connected or the refresh token is rejected. The
 * rotated pair is persisted BEFORE the new access token is returned.
 */
export async function getAccessToken(): Promise<string> {
  const tokens = await getTokens(OauthProvider.OURA);
  if (!tokens) throw new OuraAuthError("Oura is not connected");
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
    if (err instanceof OuraAuthError) throw err;
    // A transport/parse failure during refresh is also fatal to the connection.
    throw new OuraAuthError(
      `Oura token refresh failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  // Persist the rotated pair before spending the access token: a crash here must never
  // strand us holding a refresh token we already consumed but failed to record.
  await saveTokens(OauthProvider.OURA, rotated);
  return rotated.accessToken;
}

// ----- collections -----

/**
 * Thrown on HTTP 429. Not a DomainError: it is a control-flow signal handled entirely
 * inside syncOura (stop fetching, keep what landed, close the run OK), never surfaced
 * to a route/MCP error mapper.
 */
export class OuraRateLimitError extends Error {
  constructor() {
    super("Oura rate limit (429)");
    this.name = "OuraRateLimitError";
  }
}

// Raw response shapes. Typed as interfaces (not zod) to match off.ts; the full record
// is also persisted to a `raw` JSON column, so any field we don't map stays recoverable.
export interface OuraSleepRecord {
  id: string;
  day: string;
  bedtime_start: string;
  bedtime_end: string;
  total_sleep_duration: number | null;
  deep_sleep_duration: number | null;
  rem_sleep_duration: number | null;
  light_sleep_duration: number | null;
  awake_time: number | null;
  latency: number | null;
  time_in_bed: number | null;
  efficiency: number | null;
  average_heart_rate: number | null;
  average_hrv: number | null;
  lowest_heart_rate: number | null;
  type: string;
}

export interface OuraDailySleepRecord {
  id: string;
  day: string;
  score: number | null;
  contributors: Record<string, number | null>;
  timestamp: string;
}

export interface OuraDailyReadinessRecord {
  id: string;
  day: string;
  score: number | null;
  temperature_deviation: number | null;
  temperature_trend_deviation: number | null;
  contributors: Record<string, number | null>;
  timestamp: string;
}

interface OuraPage<T> {
  data: T[];
  next_token: string | null;
}

/**
 * One GET against an Oura collection endpoint with a 10s timeout. Throws
 * OuraRateLimitError on 429 (before the generic check) so the caller can stop
 * gracefully; throws a plain Error on any other non-2xx or bad JSON. The access token
 * is fetched once per pagination loop and passed in.
 */
async function ouraFetch<T>(
  path: string,
  params: Record<string, string>,
  access: string,
): Promise<OuraPage<T>> {
  const url = `${BASE}${path}?${new URLSearchParams(params).toString()}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${access}` },
      signal: controller.signal,
      // The local DB owns freshness; never let Next's fetch cache serve stale Oura data.
      cache: "no-store",
    });
    if (res.status === 429) throw new OuraRateLimitError();
    if (!res.ok) throw new Error(`Oura ${res.status} for ${path}`);
    return (await res.json()) as OuraPage<T>;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Walk every page of a collection endpoint for the window, concatenating `data`. Pulls a
 * valid access token first (refreshing as needed) and reuses it across every page.
 */
async function fetchAll<T>(
  path: string,
  startDate: string,
  endDate: string,
): Promise<T[]> {
  const access = await getAccessToken();
  const out: T[] = [];
  let nextToken: string | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const params: Record<string, string> = {
      start_date: startDate,
      end_date: endDate,
    };
    if (nextToken) params.next_token = nextToken;
    const body = await ouraFetch<T>(path, params, access);
    out.push(...body.data);
    if (!body.next_token) return out;
    nextToken = body.next_token;
  }
  throw new Error(`Oura pagination exceeded ${MAX_PAGES} pages for ${path}`);
}

export function fetchSleep(
  startDate: string,
  endDate: string,
): Promise<OuraSleepRecord[]> {
  return fetchAll<OuraSleepRecord>(
    "/v2/usercollection/sleep",
    startDate,
    endDate,
  );
}

export function fetchDailySleep(
  startDate: string,
  endDate: string,
): Promise<OuraDailySleepRecord[]> {
  return fetchAll<OuraDailySleepRecord>(
    "/v2/usercollection/daily_sleep",
    startDate,
    endDate,
  );
}

export function fetchDailyReadiness(
  startDate: string,
  endDate: string,
): Promise<OuraDailyReadinessRecord[]> {
  return fetchAll<OuraDailyReadinessRecord>(
    "/v2/usercollection/daily_readiness",
    startDate,
    endDate,
  );
}
