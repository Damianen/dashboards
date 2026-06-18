import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  authorizeUrl,
  exchangeCode,
  groupMeasures,
  parseTokenBody,
  type WithingsMeasureGroup,
  WithingsAuthError,
} from "./withings";

/** A minimal Response stand-in: the client only reads .ok, .status and .json(). */
function jsonRes(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function group(over: Partial<WithingsMeasureGroup> = {}): WithingsMeasureGroup {
  return {
    grpid: 1,
    date: 1_700_000_000, // 2023-11-14T22:13:20Z → 2023-11-14 in Amsterdam
    category: 1,
    measures: [{ value: 80523, type: 1, unit: -3 }], // 80.523 kg
    ...over,
  };
}

describe("authorizeUrl", () => {
  beforeEach(() => {
    vi.stubEnv("WITHINGS_CLIENT_ID", "cid-123");
    vi.stubEnv("WITHINGS_CLIENT_SECRET", "secret-xyz");
    vi.stubEnv(
      "WITHINGS_REDIRECT_URI",
      "http://localhost:3000/api/oauth/withings/callback",
    );
  });
  afterEach(() => vi.unstubAllEnvs());

  it("builds the consent URL with the required params, url-encoded", () => {
    const url = new URL(authorizeUrl("state-abc"));
    expect(`${url.origin}${url.pathname}`).toBe(
      "https://account.withings.com/oauth2_user/authorize2",
    );
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe("cid-123");
    expect(url.searchParams.get("scope")).toBe("user.metrics");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "http://localhost:3000/api/oauth/withings/callback",
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
        expires_in: 10800,
        scope: "user.metrics",
      },
      now,
    );
    expect(t.accessToken).toBe("acc");
    expect(t.refreshToken).toBe("ref");
    expect(t.scope).toBe("user.metrics");
    expect(t.expiresAt.getTime()).toBe(now + 10800 * 1000);
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
    vi.stubEnv("WITHINGS_CLIENT_ID", "cid-123");
    vi.stubEnv("WITHINGS_CLIENT_SECRET", "secret-xyz");
    vi.stubEnv(
      "WITHINGS_REDIRECT_URI",
      "http://localhost:3000/api/oauth/withings/callback",
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("posts a form requesttoken and returns the rotated pair on status 0", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonRes({
        status: 0,
        body: {
          access_token: "acc",
          refresh_token: "ref",
          expires_in: 10800,
          scope: "user.metrics",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const tokens = await exchangeCode("the-code");

    expect(tokens.accessToken).toBe("acc");
    expect(tokens.refreshToken).toBe("ref");
    const [url, opts] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe("https://wbsapi.withings.net/v2/oauth2");
    const init = opts as RequestInit;
    expect(init.method).toBe("POST");
    const body = String(init.body);
    expect(body).toContain("action=requesttoken");
    expect(body).toContain("grant_type=authorization_code");
    expect(body).toContain("code=the-code");
    expect(body).toContain("client_id=cid-123");
    expect(body).toContain("client_secret=secret-xyz");
  });

  it("throws WithingsAuthError when the body status is non-zero", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        jsonRes({ status: 401, error: "invalid code", body: {} }),
      ),
    );
    await expect(exchangeCode("bad")).rejects.toBeInstanceOf(WithingsAuthError);
  });
});

describe("groupMeasures", () => {
  it("scales each measure by 10^unit and maps type codes to columns", () => {
    const [row] = groupMeasures([
      group({
        measures: [
          { value: 80523, type: 1, unit: -3 }, // 80.523 kg
          { value: 182, type: 6, unit: -1 }, // 18.2 %
          { value: 35400, type: 76, unit: -3 }, // 35.4 kg muscle
          { value: 42100, type: 77, unit: -3 }, // 42.1 kg hydration
          { value: 3200, type: 88, unit: -3 }, // 3.2 kg bone
        ],
      }),
    ]);
    expect(Number(row?.weightKg)).toBeCloseTo(80.523, 3);
    expect(Number(row?.bodyFatPct)).toBeCloseTo(18.2, 1);
    expect(Number(row?.muscleMassKg)).toBeCloseTo(35.4, 1);
    expect(Number(row?.hydrationKg)).toBeCloseTo(42.1, 1);
    expect(Number(row?.boneMassKg)).toBeCloseTo(3.2, 1);
  });

  it("uses grpid as externalId and buckets the day from the unix date", () => {
    const [row] = groupMeasures([group({ grpid: 999, date: 1_700_000_000 })]);
    expect(row?.externalId).toBe("999");
    expect((row?.measuredAt as Date).toISOString()).toBe(
      "2023-11-14T22:13:20.000Z",
    );
    // 22:13Z on the 14th is still the 14th in Amsterdam (UTC+1).
    expect((row?.day as Date).toISOString()).toBe("2023-11-14T00:00:00.000Z");
  });

  it("emits one row per group and keeps the raw group", () => {
    const groups = [group({ grpid: 1 }), group({ grpid: 2 })];
    const rows = groupMeasures(groups);
    expect(rows.map((r) => r.externalId)).toEqual(["1", "2"]);
    expect(rows[0]?.raw).toEqual(groups[0]);
  });

  it("leaves missing composition fields null", () => {
    const [row] = groupMeasures([
      group({ measures: [{ value: 80000, type: 1, unit: -3 }] }),
    ]);
    expect(row?.bodyFatPct).toBeNull();
    expect(row?.muscleMassKg).toBeNull();
    expect(row?.hydrationKg).toBeNull();
    expect(row?.boneMassKg).toBeNull();
  });

  it("skips groups with no weight measure (weight_kg is non-null)", () => {
    const rows = groupMeasures([
      group({ grpid: 1, measures: [{ value: 182, type: 6, unit: -1 }] }), // fat only
      group({ grpid: 2, measures: [{ value: 80000, type: 1, unit: -3 }] }), // has weight
    ]);
    expect(rows.map((r) => r.externalId)).toEqual(["2"]);
  });
});
