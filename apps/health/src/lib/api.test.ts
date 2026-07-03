import { describe, expect, it, vi } from "vitest";

import {
  DomainError,
  NotFoundError,
  UpstreamUnavailableError,
} from "@/server/services/errors";
import { jsonError } from "./api";

describe("jsonError", () => {
  it("maps NotFoundError to 404 with the error message", async () => {
    const res = jsonError(new NotFoundError("meal", "abc"));
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "meal not found: abc" });
  });

  it("maps UpstreamUnavailableError to 502 (retryable, not a client error)", async () => {
    const res = jsonError(new UpstreamUnavailableError("Open Food Facts"));
    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toEqual({
      error: "Open Food Facts is unavailable — try again later",
    });
  });

  it("maps any other DomainError to 400", async () => {
    const res = jsonError(new DomainError("template is archived"));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "template is archived",
    });
  });

  it("maps unknown errors to 500 with a generic body (and logs them)", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const res = jsonError(new Error("secret detail"));
      expect(res.status).toBe(500);
      await expect(res.json()).resolves.toEqual({ error: "internal" });
      expect(errorSpy).toHaveBeenCalledOnce();
    } finally {
      errorSpy.mockRestore();
    }
  });
});
