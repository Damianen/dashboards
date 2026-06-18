import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { decrypt, encrypt } from "./tokens";

// A deterministic, correctly-sized key for the suite (32 bytes → base64).
const KEY = Buffer.alloc(32, 7).toString("base64");

describe("token crypto", () => {
  beforeEach(() => {
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", KEY);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("round-trips plaintext through encrypt → decrypt", () => {
    const secret = "withings-access-token.abc/123+xyz==";
    expect(decrypt(encrypt(secret))).toBe(secret);
  });

  it("emits iv.ciphertext.tag with a fresh IV each call (same plaintext differs)", () => {
    const a = encrypt("same");
    const b = encrypt("same");
    expect(a.split(".")).toHaveLength(3);
    expect(a).not.toBe(b); // random IV ⇒ different ciphertext
    expect(decrypt(a)).toBe("same");
    expect(decrypt(b)).toBe("same");
  });

  it("throws when the auth tag is tampered (forged tag)", () => {
    const [iv, ct] = encrypt("tamper-me").split(".");
    const forgedTag = Buffer.alloc(16, 0).toString("base64");
    expect(() => decrypt(`${iv}.${ct}.${forgedTag}`)).toThrow();
  });

  it("throws when the ciphertext is tampered (flipped byte)", () => {
    const [iv, ct, tag] = encrypt("tamper-me").split(".");
    const bytes = Buffer.from(ct ?? "", "base64");
    bytes[0] = (bytes[0] ?? 0) ^ 0xff;
    expect(() => decrypt(`${iv}.${bytes.toString("base64")}.${tag}`)).toThrow();
  });

  it("throws on a malformed payload (missing parts)", () => {
    expect(() => decrypt("only-one-part")).toThrow(/malformed/);
  });

  it("rejects a key that isn't 32 bytes", () => {
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", Buffer.alloc(16).toString("base64"));
    expect(() => encrypt("x")).toThrow(/32 bytes/);
  });

  it("throws when the key env var is absent", () => {
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", "");
    expect(() => encrypt("x")).toThrow(/not set/);
  });
});
