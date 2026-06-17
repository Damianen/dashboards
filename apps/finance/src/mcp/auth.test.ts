import { describe, expect, it } from "vitest";
import { verifyBearer } from "./auth";

const TOKEN = "s3cret-token-of-some-length";

describe("verifyBearer", () => {
  it("accepts the exact 'Bearer <token>' header", () => {
    expect(verifyBearer(`Bearer ${TOKEN}`, TOKEN)).toBe(true);
  });

  it("rejects a wrong token of the same length without throwing", () => {
    const wrong = "x".repeat(TOKEN.length);
    expect(verifyBearer(`Bearer ${wrong}`, TOKEN)).toBe(false);
  });

  it("rejects (does not throw) when the header length differs from expected", () => {
    expect(verifyBearer("Bearer short", TOKEN)).toBe(false);
    expect(verifyBearer(`Bearer ${TOKEN}extra`, TOKEN)).toBe(false);
  });

  it("rejects a missing scheme or raw token", () => {
    expect(verifyBearer(TOKEN, TOKEN)).toBe(false);
  });

  it("rejects a null header", () => {
    expect(verifyBearer(null, TOKEN)).toBe(false);
  });

  it("rejects when no token is configured", () => {
    expect(verifyBearer(`Bearer ${TOKEN}`, undefined)).toBe(false);
    expect(verifyBearer(`Bearer ${TOKEN}`, "")).toBe(false);
  });
});
