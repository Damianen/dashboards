import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The OAuth token store is mocked so the client's getAccessToken() resolves a known token
// without a database. Hoisted above the import of ./oura by vitest.
vi.mock("@/server/services/tokens", () => ({
  getTokens: vi.fn(),
  saveTokens: vi.fn(),
}));

import { getTokens, type OauthTokens } from "@/server/services/tokens";

import {
  authorizeUrl,
  exchangeCode,
  fetchSleep,
  type OuraSleepRecord,
  OuraAuthError,
  OuraRateLimitError,
  parseTokenBody,
} from "./oura";

const getTokensMock = vi.mocked(getTokens);

/** A valid, comfortably-unexpired stored token set (well beyond the refresh skew). */
function storedTokens(): OauthTokens {
  return {
    accessToken: "test-access",
    refreshToken: "test-refresh",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    scope: "daily",
  };
}

function sleepRec(id: string): OuraSleepRecord {
  return {
    id,
    day: "2026-01-02",
    bedtime_start: "2026-01-01T23:00:00.000Z",
    bedtime_end: "2026-01-02T07:00:00.000Z",
    total_sleep_duration: 27000,
    deep_sleep_duration: null,
    rem_sleep_duration: null,
    light_sleep_duration: null,
    awake_time: null,
    latency: null,
    time_in_bed: null,
    efficiency: null,
    average_heart_rate: null,
    average_hrv: null,
    lowest_heart_rate: null,
    type: "long_sleep",
  };
}

/** A minimal Response stand-in: the client only reads .status, .ok and .json(). */
function jsonRes(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

describe("oura collection client", () => {
  beforeEach(() => {
    getTokensMock.mockResolvedValue(storedTokens());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("follows next_token, concatenating every page's data in order", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonRes({ data: [sleepRec("a"), sleepRec("b")], next_token: "t1" }),
      )
      .mockResolvedValueOnce(jsonRes({ data: [sleepRec("c")], next_token: null }));
    vi.stubGlobal("fetch", fetchMock);

    const out = await fetchSleep("2026-01-01", "2026-01-05");

    expect(out).toEqual([sleepRec("a"), sleepRec("b"), sleepRec("c")]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("sends start_date/end_date and URL-encodes an opaque next_token", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonRes({ data: [], next_token: "ab+c/d=" }))
      .mockResolvedValueOnce(jsonRes({ data: [], next_token: null }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchSleep("2026-01-01", "2026-01-05");

    const [firstUrl] = fetchMock.mock.calls[0] ?? [];
    expect(String(firstUrl)).toContain("/v2/usercollection/sleep?");
    expect(String(firstUrl)).toContain("start_date=2026-01-01");
    expect(String(firstUrl)).toContain("end_date=2026-01-05");
    const [secondUrl] = fetchMock.mock.calls[1] ?? [];
    expect(String(secondUrl)).toContain("next_token=ab%2Bc%2Fd%3D");
  });

  it("sends the stored access token as a Bearer header against the Oura base URL", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonRes({ data: [], next_token: null }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchSleep("2026-01-01", "2026-01-05");

    const [url, opts] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toMatch(/^https:\/\/api\.ouraring\.com\//);
    expect((opts as RequestInit).headers).toMatchObject({
      Authorization: "Bearer test-access",
    });
  });

  it("returns an empty array when the window has no data", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonRes({ data: [], next_token: null }));
    vi.stubGlobal("fetch", fetchMock);

    expect(await fetchSleep("2026-01-01", "2026-01-05")).toEqual([]);
  });

  it("throws OuraRateLimitError on 429", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonRes({}, 429)));
    await expect(fetchSleep("2026-01-01", "2026-01-05")).rejects.toBeInstanceOf(
      OuraRateLimitError,
    );
  });

  it("throws OuraRateLimitError on a 429 mid-pagination", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonRes({ data: [sleepRec("a")], next_token: "t1" }))
      .mockResolvedValueOnce(jsonRes({}, 429));
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchSleep("2026-01-01", "2026-01-05")).rejects.toBeInstanceOf(
      OuraRateLimitError,
    );
  });

  it("throws a plain Error (not a rate-limit) on other non-2xx statuses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonRes({}, 500)));
    const err = await fetchSleep("2026-01-01", "2026-01-05").catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(OuraRateLimitError);
    expect((err as Error).message).toContain("500");
  });

  it("aborts a runaway next_token loop instead of paginating forever", async () => {
    // Always returns a token → would never terminate without the MAX_PAGES guard.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonRes({ data: [], next_token: "loop" })),
    );
    await expect(fetchSleep("2026-01-01", "2026-01-05")).rejects.toThrow(
      /exceeded .* pages/,
    );
  });

  it("throws OuraAuthError without calling fetch when Oura is not connected", async () => {
    getTokensMock.mockResolvedValue(null);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      fetchSleep("2026-01-01", "2026-01-05"),
    ).rejects.toBeInstanceOf(OuraAuthError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("authorizeUrl", () => {
  beforeEach(() => {
    vi.stubEnv("OURA_CLIENT_ID", "cid-123");
    vi.stubEnv("OURA_CLIENT_SECRET", "secret-xyz");
    vi.stubEnv(
      "OURA_REDIRECT_URI",
      "http://localhost:3000/api/oauth/oura/callback",
    );
  });
  afterEach(() => vi.unstubAllEnvs());

  it("builds the consent URL with the required params, url-encoded", () => {
    const url = new URL(authorizeUrl("state-abc"));
    expect(`${url.origin}${url.pathname}`).toBe(
      "https://cloud.ouraring.com/oauth/authorize",
    );
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe("cid-123");
    expect(url.searchParams.get("scope")).toBe("daily");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "http://localhost:3000/api/oauth/oura/callback",
    );
    expect(url.searchParams.get("state")).toBe("state-abc");
  });
});

describe("parseTokenBody", () => {
  it("maps body fields and computes expiresAt from now + expires_in", () => {
    const now = 1_000_000;
    const t = parseTokenBody(
      {
        access_token: "acc",
        refresh_token: "ref",
        expires_in: 2_592_000, // ~30 days
        scope: "daily",
      },
      now,
    );
    expect(t.accessToken).toBe("acc");
    expect(t.refreshToken).toBe("ref");
    expect(t.scope).toBe("daily");
    expect(t.expiresAt.getTime()).toBe(now + 2_592_000 * 1000);
  });

  it("defaults a missing scope to null", () => {
    const t = parseTokenBody(
      { access_token: "a", refresh_token: "r", expires_in: 1 },
      0,
    );
    expect(t.scope).toBeNull();
  });
});

describe("exchangeCode", () => {
  beforeEach(() => {
    vi.stubEnv("OURA_CLIENT_ID", "cid-123");
    vi.stubEnv("OURA_CLIENT_SECRET", "secret-xyz");
    vi.stubEnv(
      "OURA_REDIRECT_URI",
      "http://localhost:3000/api/oauth/oura/callback",
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("posts a standard authorization_code form and returns the token pair", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonRes({
        access_token: "acc",
        refresh_token: "ref",
        token_type: "Bearer",
        expires_in: 2_592_000,
        scope: "daily",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const tokens = await exchangeCode("the-code");

    expect(tokens.accessToken).toBe("acc");
    expect(tokens.refreshToken).toBe("ref");
    const [url, opts] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe("https://api.ouraring.com/oauth/token");
    const init = opts as RequestInit;
    expect(init.method).toBe("POST");
    const body = String(init.body);
    expect(body).toContain("grant_type=authorization_code");
    expect(body).toContain("code=the-code");
    expect(body).toContain("redirect_uri=");
    expect(body).toContain("client_id=cid-123");
    expect(body).toContain("client_secret=secret-xyz");
  });

  it("throws OuraAuthError when the token endpoint rejects the code", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        jsonRes(
          { error: "invalid_grant", error_description: "bad code" },
          400,
        ),
      ),
    );
    await expect(exchangeCode("bad")).rejects.toBeInstanceOf(OuraAuthError);
  });
});
