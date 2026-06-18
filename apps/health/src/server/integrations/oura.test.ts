import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  fetchSleep,
  type OuraSleepRecord,
  OuraRateLimitError,
} from "./oura";

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

describe("oura client", () => {
  beforeEach(() => {
    vi.stubEnv("OURA_PAT", "test-pat");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
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

  it("sends the PAT as a Bearer header against the Oura base URL", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonRes({ data: [], next_token: null }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchSleep("2026-01-01", "2026-01-05");

    const [url, opts] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toMatch(/^https:\/\/api\.ouraring\.com\//);
    expect((opts as RequestInit).headers).toMatchObject({
      Authorization: "Bearer test-pat",
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

  it("throws synchronously-rejected when OURA_PAT is missing, never calling fetch", async () => {
    vi.stubEnv("OURA_PAT", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchSleep("2026-01-01", "2026-01-05")).rejects.toThrow(
      "OURA_PAT is not set",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
