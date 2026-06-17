import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { analyzeImage, VisionError } from "./vision";

const schema = z.object({ kcal: z.number(), name: z.string() });

const API_KEY = "test-vision-key";
const TINY_IMAGE = "data:image/png;base64,aGVsbG8="; // "hello"

/** A minimal Response stand-in: the client only reads .ok, .status and .json(). */
function jsonRes(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

/** A chat-completions reply whose assistant message content is `content`. */
function completion(content: string) {
  return jsonRes({ choices: [{ message: { content } }] });
}

/** The parsed POST body of the Nth fetch call. */
function bodyOf(fetchMock: ReturnType<typeof vi.fn>, call: number) {
  const opts = fetchMock.mock.calls[call]?.[1] as RequestInit;
  return JSON.parse(String(opts.body));
}

describe("analyzeImage", () => {
  beforeEach(() => {
    vi.stubEnv("VISION_API_BASE_URL", "https://vision.example/api/v1");
    vi.stubEnv("VISION_API_KEY", API_KEY);
    vi.stubEnv("VISION_MODEL", "test-vision-model");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("returns the schema-parsed object on a valid reply", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(completion('{"kcal": 250, "name": "apple"}'));
    vi.stubGlobal("fetch", fetchMock);

    const out = await analyzeImage({
      imageDataUrl: TINY_IMAGE,
      instruction: "Estimate the food.",
      schema,
    });

    expect(out).toEqual({ kcal: 250, name: "apple" });
  });

  it("sends a well-formed OpenAI-compatible request", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(completion('{"kcal": 1, "name": "x"}'));
    vi.stubGlobal("fetch", fetchMock);

    await analyzeImage({
      imageDataUrl: TINY_IMAGE,
      instruction: "Estimate the food.",
      schema,
    });

    const [url, opts] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe("https://vision.example/api/v1/chat/completions");
    expect((opts as RequestInit).method).toBe("POST");
    expect((opts as RequestInit).headers).toMatchObject({
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    });

    const body = bodyOf(fetchMock, 0);
    expect(body.model).toBe("test-vision-model");
    expect(body.temperature).toBe(0);
    expect(body.response_format).toEqual({ type: "json_object" });
    const content = body.messages[0].content;
    expect(content[0]).toMatchObject({ type: "text" });
    expect(content[0].text).toContain("Estimate the food.");
    expect(content[1]).toEqual({
      type: "image_url",
      image_url: { url: TINY_IMAGE },
    });
  });

  it("retries once with a corrective hint, then succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(completion("sorry, I can't do that"))
      .mockResolvedValueOnce(completion('{"kcal": 90, "name": "banana"}'));
    vi.stubGlobal("fetch", fetchMock);

    const out = await analyzeImage({
      imageDataUrl: TINY_IMAGE,
      instruction: "Estimate the food.",
      schema,
    });

    expect(out).toEqual({ kcal: 90, name: "banana" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const retryText = bodyOf(fetchMock, 1).messages[0].content[0].text;
    expect(retryText).toContain("previous reply was not valid JSON");
  });

  it("throws VisionError when both attempts return non-JSON", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(completion("still no json here"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      analyzeImage({
        imageDataUrl: TINY_IMAGE,
        instruction: "Estimate the food.",
        schema,
      }),
    ).rejects.toBeInstanceOf(VisionError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries then throws VisionError when JSON never matches the schema", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(completion('{"unexpected": true}'));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      analyzeImage({
        imageDataUrl: TINY_IMAGE,
        instruction: "Estimate the food.",
        schema,
      }),
    ).rejects.toBeInstanceOf(VisionError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects an oversized image without calling the provider", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const huge = "data:image/png;base64," + "A".repeat(7_000_000); // ~5.25 MB decoded

    await expect(
      analyzeImage({
        imageDataUrl: huge,
        instruction: "Estimate the food.",
        schema,
      }),
    ).rejects.toBeInstanceOf(VisionError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps a non-2xx response to VisionError without leaking the body or key", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonRes("provider exploded: secret-internal-detail", 500));
    vi.stubGlobal("fetch", fetchMock);

    const err = await analyzeImage({
      imageDataUrl: TINY_IMAGE,
      instruction: "Estimate the food.",
      schema,
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(VisionError);
    const message = (err as VisionError).message;
    expect(message).toContain("500");
    expect(message).not.toContain("secret-internal-detail");
    expect(message).not.toContain(API_KEY);
  });

  it("maps an aborted/timed-out request to a VisionError", async () => {
    const abortErr = Object.assign(new Error("aborted"), { name: "AbortError" });
    const fetchMock = vi.fn().mockRejectedValue(abortErr);
    vi.stubGlobal("fetch", fetchMock);

    const err = await analyzeImage({
      imageDataUrl: TINY_IMAGE,
      instruction: "Estimate the food.",
      schema,
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(VisionError);
    expect((err as VisionError).message).toBe("vision request timed out");
  });

  it("throws when VISION_API_KEY is missing", async () => {
    vi.stubEnv("VISION_API_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      analyzeImage({
        imageDataUrl: TINY_IMAGE,
        instruction: "Estimate the food.",
        schema,
      }),
    ).rejects.toThrow("VISION_API_KEY is not set");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
