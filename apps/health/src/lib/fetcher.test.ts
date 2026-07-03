import { describe, expect, it } from "vitest";

import { HttpError, httpErrorMessage } from "./fetcher";

describe("httpErrorMessage", () => {
  it("surfaces the server's { error } string from an HttpError body", () => {
    const err = new HttpError(400, "POST /api/exercises failed", {
      error: "An exercise with this name already exists",
    });
    expect(httpErrorMessage(err, "fallback")).toBe(
      "An exercise with this name already exists",
    );
  });

  it("falls back when the body's error is not a string (e.g. a Zod flatten)", () => {
    const zodFlatten = new HttpError(400, "POST /api/foo failed", {
      error: { formErrors: [], fieldErrors: { name: ["Required"] } },
    });
    expect(httpErrorMessage(zodFlatten, "fallback")).toBe("fallback");

    const emptyError = new HttpError(400, "POST /api/foo failed", {
      error: "",
    });
    expect(httpErrorMessage(emptyError, "fallback")).toBe("fallback");

    const noJsonBody = new HttpError(500, "GET /api/foo failed", null);
    expect(httpErrorMessage(noJsonBody, "fallback")).toBe("fallback");
  });

  it("falls back for plain Errors", () => {
    expect(httpErrorMessage(new TypeError("fetch failed"), "fallback")).toBe(
      "fallback",
    );
  });

  it("falls back for undefined", () => {
    expect(httpErrorMessage(undefined, "fallback")).toBe("fallback");
  });
});
