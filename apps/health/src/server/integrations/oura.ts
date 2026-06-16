// Oura v2 API client. Auth is a static Personal Access Token (OURA_PAT) — no OAuth
// rotation, unlike Withings/Google. Every collection endpoint takes start_date/end_date
// (YYYY-MM-DD) and paginates via an opaque `next_token`; we loop until it is null.
// This file is the I/O boundary: it returns plain typed records and never touches the DB.

const BASE = "https://api.ouraring.com";
const TIMEOUT_MS = 10_000;
// next_token is server-driven; a window of ~90 days yields a handful of pages. Cap the
// loop so a contract change that always returns a token can't spin forever.
const MAX_PAGES = 50;

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

function pat(): string {
  const token = process.env.OURA_PAT;
  if (!token) throw new Error("OURA_PAT is not set");
  return token;
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
 * gracefully; throws a plain Error on any other non-2xx or bad JSON.
 */
async function ouraFetch<T>(
  path: string,
  params: Record<string, string>,
): Promise<OuraPage<T>> {
  const url = `${BASE}${path}?${new URLSearchParams(params).toString()}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${pat()}` },
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

/** Walk every page of a collection endpoint for the window, concatenating `data`. */
async function fetchAll<T>(
  path: string,
  startDate: string,
  endDate: string,
): Promise<T[]> {
  const out: T[] = [];
  let nextToken: string | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const params: Record<string, string> = {
      start_date: startDate,
      end_date: endDate,
    };
    if (nextToken) params.next_token = nextToken;
    const body = await ouraFetch<T>(path, params);
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
