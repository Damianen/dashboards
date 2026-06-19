import { afterEach, describe, expect, it, vi } from "vitest";

import { consumeOauthState, rememberOauthState } from "./oauth-state";

describe("oauth state store", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("accepts a remembered state exactly once (one-shot)", () => {
    rememberOauthState("oura", "abc");
    expect(consumeOauthState("oura", "abc")).toBe(true);
    expect(consumeOauthState("oura", "abc")).toBe(false);
  });

  it("rejects a state that was never issued", () => {
    expect(consumeOauthState("oura", "never-issued")).toBe(false);
  });

  it("namespaces by provider — an oura state can't satisfy withings", () => {
    rememberOauthState("oura", "shared");
    expect(consumeOauthState("withings", "shared")).toBe(false);
    expect(consumeOauthState("oura", "shared")).toBe(true);
  });

  it("rejects a state once the TTL has elapsed", () => {
    vi.useFakeTimers();
    rememberOauthState("oura", "stale");
    vi.advanceTimersByTime(10 * 60 * 1000 + 1);
    expect(consumeOauthState("oura", "stale")).toBe(false);
  });

  it("still accepts a state just before the TTL elapses", () => {
    vi.useFakeTimers();
    rememberOauthState("withings", "fresh");
    vi.advanceTimersByTime(10 * 60 * 1000 - 1);
    expect(consumeOauthState("withings", "fresh")).toBe(true);
  });
});
