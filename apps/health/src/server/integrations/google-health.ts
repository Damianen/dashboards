// Google Health API (v4) client — the device feed behind daily_activity. Auth is standard
// Google OAuth: tokens are stored AES-256-GCM-encrypted via the tokens service and
// getAccessToken() pre-emptively refreshes behind one in-process lock (same shape as
// Withings) so two concurrent syncs never race a refresh. UNLIKE Withings' single-use
// tokens, Google's refresh token is long-lived and usually NOT rotated — a refresh
// response normally omits refresh_token, so we carry the existing one forward and only
// persist a new one when Google actually returns it.
//
// The v4 surface is brand new (successor to the Fitbit Web API). Every endpoint, scope,
// aggregation method, dataType id and response field below is annotated `// VERIFY` against
// https://developers.google.com/health and must be confirmed before a live sync succeeds —
// dataType ids are CASE-SENSITIVE and a wrong one errors INVALID_PARENT_DATA_TYPE_COLLECTION.
// We persist the full upstream payload per day in `raw`, so a wrong field mapping loses nothing.
//
// This file is the I/O + token boundary: it returns plain typed rows and only touches the
// DB via the tokens service.

import { OauthProvider } from "@/generated/prisma/client";
import { DomainError } from "@/server/services/errors";
import {
  getTokens,
  type OauthTokens,
  saveTokens,
} from "@/server/services/tokens";

// ----- the one place every Google Health endpoint / dataType string lives -----
// OAuth (standard Google) — VERIFY at https://developers.google.com/health
const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE =
  "https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly"; // VERIFY
// Health v4 data surface — VERIFY at https://developers.google.com/health
const dataPointsUrl = (dataType: string) =>
  `https://health.googleapis.com/v4/users/me/dataTypes/${dataType}/dataPoints`; // VERIFY
const AGGREGATION = "dailyRollUp"; // VERIFY aggregation method (returns civil-day aggregates)
// dataType ids are CASE-SENSITIVE; a wrong id errors INVALID_PARENT_DATA_TYPE_COLLECTION.
const DATA_TYPE_ENERGY = "energy_expenditure"; // VERIFY exact id — active + total kcal rollup
const DATA_TYPE_STEPS = "steps"; // VERIFY exact id — step-count rollup
// Civil-day rollups need an explicit tz so a "day" is Amsterdam-local, not UTC.
const TIMEZONE = "Europe/Amsterdam";
// Aggregated value field names inside a rollup point — VERIFY at developers.google.com/health.
const FIELD_ACTIVE_KCAL = "activeKilocalories"; // VERIFY
const FIELD_TOTAL_KCAL = "totalKilocalories"; // VERIFY
const FIELD_STEPS = "count"; // VERIFY (step rollup total)
const FIELD_DAY = "day"; // VERIFY civil-day field on a rollup point (maybe "localDate"/"startDate")

const TIMEOUT_MS = 10_000;
// Google access tokens last ~1h; refresh a few minutes early so a long sync never expires.
const REFRESH_SKEW_MS = 5 * 60 * 1000;

/**
 * A re-auth signal: Google Health is not connected, or its refresh token was rejected
 * (e.g. `invalid_grant` — the grant was revoked). A DomainError so route/MCP mappers
 * render its message; the sync service catches it to close the run "needs re-auth".
 */
export class GoogleAuthError extends DomainError {}

function clientId(): string {
  const v = process.env.GOOGLE_CLIENT_ID;
  if (!v) throw new Error("GOOGLE_CLIENT_ID is not set");
  return v;
}

function clientSecret(): string {
  const v = process.env.GOOGLE_CLIENT_SECRET;
  if (!v) throw new Error("GOOGLE_CLIENT_SECRET is not set");
  return v;
}

function redirectUri(): string {
  const v = process.env.GOOGLE_REDIRECT_URI;
  if (!v) throw new Error("GOOGLE_REDIRECT_URI is not set");
  return v;
}

/**
 * The consent URL to send the user to. `state` is the CSRF token we verify on callback.
 * access_type=offline + prompt=consent are what make Google return a refresh_token.
 */
export function authorizeUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId(),
    redirect_uri: redirectUri(),
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

// ----- token endpoint -----

interface GoogleTokenBody {
  access_token: string;
  expires_in: number;
  refresh_token?: string; // omitted on refresh when Google does not rotate it
  scope?: string;
}

/**
 * Map a token-endpoint body to our token set; expiresAt is `now + expires_in`. When the
 * body omits refresh_token (the normal refresh case) the stored one is carried forward via
 * `fallbackRefreshToken`. Throws if neither is present (nothing to refresh with). Pure.
 */
export function parseTokenBody(
  body: GoogleTokenBody,
  now: number,
  fallbackRefreshToken?: string,
): OauthTokens {
  const refreshToken = body.refresh_token ?? fallbackRefreshToken;
  if (!refreshToken) {
    throw new GoogleAuthError(
      "Google token response carried no refresh_token and none was stored",
    );
  }
  return {
    accessToken: body.access_token,
    refreshToken,
    expiresAt: new Date(now + body.expires_in * 1000),
    scope: body.scope ?? null,
  };
}

interface GoogleErrorBody {
  error?: string;
  error_description?: string;
}

async function tokenRequest(
  params: Record<string, string>,
  fallbackRefreshToken?: string,
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
      // Google uses real status codes (unlike Withings' always-200). A 4xx here means the
      // code/refresh token was rejected — a re-auth condition.
      const body = (await res.json().catch(() => ({}))) as GoogleErrorBody;
      const detail = body.error_description ?? body.error;
      throw new GoogleAuthError(
        `Google token request rejected (HTTP ${res.status}${detail ? `: ${detail}` : ""})`,
      );
    }
    return parseTokenBody(
      (await res.json()) as GoogleTokenBody,
      Date.now(),
      fallbackRefreshToken,
    );
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

// Serializes refreshes so concurrent callers share one in-flight refresh rather than firing
// redundant token requests for the same near-expiry access token.
let refreshLock: Promise<string> | null = null;

/**
 * A valid Google access token, refreshing first if it expires within REFRESH_SKEW_MS.
 * Throws GoogleAuthError if Google Health isn't connected or the refresh token is rejected.
 * The (possibly carried-forward) pair is persisted BEFORE the new access token is returned.
 */
export async function getAccessToken(): Promise<string> {
  const tokens = await getTokens(OauthProvider.GOOGLE);
  if (!tokens) throw new GoogleAuthError("Google Health is not connected");
  if (tokens.expiresAt.getTime() - Date.now() > REFRESH_SKEW_MS) {
    return tokens.accessToken;
  }
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
    // Pass the current refresh token as the fallback: Google usually does not rotate it,
    // so the response omits it and we must keep the one we have.
    rotated = await tokenRequest(
      { grant_type: "refresh_token", refresh_token: refreshToken },
      refreshToken,
    );
  } catch (err) {
    if (err instanceof GoogleAuthError) throw err;
    throw new GoogleAuthError(
      `Google token refresh failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  // Persist before spending the access token so a crash never strands a rotated pair.
  await saveTokens(OauthProvider.GOOGLE, rotated);
  return rotated.accessToken;
}

// ----- daily activity rollups -----

/**
 * One civil-day rollup point. The aggregated value fields differ by dataType (energy vs
 * steps), so all are optional; the merge reads only the ones it expects per source. The
 * full point is preserved in `raw`. Field names are VERIFY (see consts block).
 */
export interface RollupPoint {
  [key: string]: unknown;
}

interface RollupResponse {
  dataPoints?: RollupPoint[]; // VERIFY container field (maybe `point` / `bucket`)
}

/** One merged civil day of activity, the shape the sync service maps to a DailyActivity row. */
export interface DailyActivityRow {
  day: string; // civil day "YYYY-MM-DD"
  activeKcal?: number;
  totalKcal?: number;
  steps?: number;
  raw: unknown;
}

/** Read a numeric field off a rollup point, ignoring absent/non-finite values. */
function num(point: RollupPoint, field: string): number | undefined {
  const v = point[field];
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function dayOfPoint(point: RollupPoint): string | undefined {
  const v = point[FIELD_DAY];
  return typeof v === "string" ? v : undefined;
}

/**
 * Merge the energy-expenditure and steps daily rollups into one row per civil day. Active
 * and total kcal come from the energy rollup, steps from the steps rollup; each metric is
 * rounded to a whole unit (the columns are Int) and only set when present. Per-day `raw`
 * keeps both source points (`{ energy?, steps? }`) so nothing upstream is lost. Pure.
 */
export function mergeDailyActivity(
  energyPoints: RollupPoint[],
  stepsPoints: RollupPoint[],
): DailyActivityRow[] {
  const byDay = new Map<string, DailyActivityRow>();

  const get = (day: string): DailyActivityRow => {
    let row = byDay.get(day);
    if (!row) {
      row = { day, raw: {} };
      byDay.set(day, row);
    }
    return row;
  };

  for (const p of energyPoints) {
    const day = dayOfPoint(p);
    if (!day) continue;
    const row = get(day);
    const active = num(p, FIELD_ACTIVE_KCAL);
    const total = num(p, FIELD_TOTAL_KCAL);
    if (active !== undefined) row.activeKcal = Math.round(active);
    if (total !== undefined) row.totalKcal = Math.round(total);
    (row.raw as Record<string, unknown>).energy = p;
  }

  for (const p of stepsPoints) {
    const day = dayOfPoint(p);
    if (!day) continue;
    const row = get(day);
    const steps = num(p, FIELD_STEPS);
    if (steps !== undefined) row.steps = Math.round(steps);
    (row.raw as Record<string, unknown>).steps = p;
  }

  return [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
}

/** GET one dataType's dailyRollUp for the civil-day window, returning its rollup points. */
async function fetchRollup(
  dataType: string,
  startDay: string,
  endDay: string,
  access: string,
): Promise<RollupPoint[]> {
  const params = new URLSearchParams({
    aggregation: AGGREGATION, // VERIFY param name
    startDate: startDay, // VERIFY param name (civil day YYYY-MM-DD)
    endDate: endDay, // VERIFY param name
    timeZone: TIMEZONE, // VERIFY param name
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${dataPointsUrl(dataType)}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${access}` },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) {
      // Surface the API's own error (e.g. INVALID_PARENT_DATA_TYPE_COLLECTION for a wrong
      // dataType id) so it lands verbatim in the SyncRun row.
      const body = (await res.json().catch(() => ({}))) as {
        error?: { status?: string; message?: string };
      };
      const detail = body.error?.status ?? body.error?.message;
      throw new Error(
        `Google Health ${dataType} HTTP ${res.status}${detail ? `: ${detail}` : ""}`,
      );
    }
    const json = (await res.json()) as RollupResponse;
    return json.dataPoints ?? [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Daily activity for the civil-day window [startDay, endDay]. Pulls a valid access token
 * first (refreshing as needed), then fetches the energy-expenditure and steps daily
 * rollups and merges them into one row per day. Token failures surface as GoogleAuthError;
 * any other failure surfaces as a plain Error for the sync run to record.
 */
export async function fetchDailyActivity(
  startDay: string,
  endDay: string,
): Promise<DailyActivityRow[]> {
  const access = await getAccessToken();
  const [energy, steps] = await Promise.all([
    fetchRollup(DATA_TYPE_ENERGY, startDay, endDay, access),
    fetchRollup(DATA_TYPE_STEPS, startDay, endDay, access),
  ]);
  return mergeDailyActivity(energy, steps);
}
