import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  authorizeUrl,
  exchangeCode,
  GoogleAuthError,
  mergeDailyActivity,
  parseTokenBody,
  type RollupPoint,
} from "./google-health";

/** A minimal Response stand-in: the client only reads .ok, .status and .json(). */
function jsonRes(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

describe("authorizeUrl", () => {
  beforeEach(() => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "cid-123");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "secret-xyz");
    vi.stubEnv(
      "GOOGLE_REDIRECT_URI",
      "http://localhost:3000/api/oauth/google/callback",
    );
  });
  afterEach(() => vi.unstubAllEnvs());

  it("builds the consent URL with offline access + forced consent", () => {
    const url = new URL(authorizeUrl("state-abc"));
    expect(`${url.origin}${url.pathname}`).toBe(
      "https://accounts.google.com/o/oauth2/v2/auth",
    );
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe("cid-123");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "http://localhost:3000/api/oauth/google/callback",
    );
    expect(url.searchParams.get("scope")).toBe(
      "https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly",
    );
    // offline + consent are what make Google mint (and re-mint) a refresh token.
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("state")).toBe("state-abc");
  });
});

describe("parseTokenBody", () => {
  it("maps fields and computes expiresAt from now + expires_in", () => {
    const now = 1_000_000;
    const t = parseTokenBody(
      { access_token: "acc", refresh_token: "ref", expires_in: 3600, scope: "s" },
      now,
    );
    expect(t.accessToken).toBe("acc");
    expect(t.refreshToken).toBe("ref");
    expect(t.scope).toBe("s");
    expect(t.expiresAt.getTime()).toBe(now + 3600 * 1000);
  });

  it("carries the fallback refresh token when the body omits one (Google refresh)", () => {
    const t = parseTokenBody(
      { access_token: "acc2", expires_in: 3600 },
      0,
      "stored-ref",
    );
    expect(t.refreshToken).toBe("stored-ref");
    expect(t.scope).toBeNull();
  });

  it("prefers a rotated refresh_token over the fallback when present", () => {
    const t = parseTokenBody(
      { access_token: "a", refresh_token: "new", expires_in: 1 },
      0,
      "old",
    );
    expect(t.refreshToken).toBe("new");
  });

  it("throws GoogleAuthError when neither a new nor a stored refresh token exists", () => {
    expect(() =>
      parseTokenBody({ access_token: "a", expires_in: 1 }, 0),
    ).toThrow(GoogleAuthError);
  });
});

describe("exchangeCode", () => {
  beforeEach(() => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "cid-123");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "secret-xyz");
    vi.stubEnv(
      "GOOGLE_REDIRECT_URI",
      "http://localhost:3000/api/oauth/google/callback",
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("posts a form authorization_code grant and returns the pair", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonRes({
        access_token: "acc",
        refresh_token: "ref",
        expires_in: 3600,
        scope: "s",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const tokens = await exchangeCode("the-code");
    expect(tokens.accessToken).toBe("acc");
    expect(tokens.refreshToken).toBe("ref");

    const [url, opts] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe("https://oauth2.googleapis.com/token");
    const init = opts as RequestInit;
    expect(init.method).toBe("POST");
    const body = String(init.body);
    expect(body).toContain("grant_type=authorization_code");
    expect(body).toContain("code=the-code");
    expect(body).toContain("client_id=cid-123");
    expect(body).toContain("client_secret=secret-xyz");
  });

  it("throws GoogleAuthError when the token endpoint rejects the code", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        jsonRes({ error: "invalid_grant", error_description: "bad code" }, 400),
      ),
    );
    await expect(exchangeCode("bad")).rejects.toBeInstanceOf(GoogleAuthError);
  });
});

describe("mergeDailyActivity", () => {
  it("merges energy + steps rollups into one row per civil day", () => {
    const energy: RollupPoint[] = [
      { day: "2026-06-14", activeKilocalories: 512.4, totalKilocalories: 2310.8 },
    ];
    const steps: RollupPoint[] = [{ day: "2026-06-14", count: 8421 }];

    const [row] = mergeDailyActivity(energy, steps);
    expect(row?.day).toBe("2026-06-14");
    expect(row?.activeKcal).toBe(512); // rounded to the Int column
    expect(row?.totalKcal).toBe(2311); // rounded
    expect(row?.steps).toBe(8421);
    // Per-day raw keeps both source points verbatim.
    expect(row?.raw).toEqual({ energy: energy[0], steps: steps[0] });
  });

  it("leaves metrics absent when a dataType has no point for that day", () => {
    const [row] = mergeDailyActivity([], [{ day: "2026-06-15", count: 100 }]);
    expect(row?.steps).toBe(100);
    expect(row?.activeKcal).toBeUndefined();
    expect(row?.totalKcal).toBeUndefined();
    expect(row?.raw).toEqual({ steps: { day: "2026-06-15", count: 100 } });
  });

  it("skips points with no civil-day field and ignores non-finite values", () => {
    const energy: RollupPoint[] = [
      { activeKilocalories: 100 }, // no day → skipped entirely
      { day: "2026-06-16", activeKilocalories: Number.NaN, totalKilocalories: 2000 },
    ];
    const rows = mergeDailyActivity(energy, []);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.day).toBe("2026-06-16");
    expect(rows[0]?.activeKcal).toBeUndefined(); // NaN ignored
    expect(rows[0]?.totalKcal).toBe(2000);
  });

  it("returns rows sorted by civil day", () => {
    const rows = mergeDailyActivity(
      [
        { day: "2026-06-16", activeKilocalories: 1 },
        { day: "2026-06-14", activeKilocalories: 2 },
      ],
      [],
    );
    expect(rows.map((r) => r.day)).toEqual(["2026-06-14", "2026-06-16"]);
  });
});
