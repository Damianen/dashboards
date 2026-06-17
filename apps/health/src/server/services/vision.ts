// Provider-agnostic vision client. Sends one image + an instruction to any
// OpenAI-compatible chat-completions endpoint and returns the reply parsed
// through a caller-supplied Zod schema. Deliberately domain-free: no food,
// label, or macro logic lives here — callers own the schema and the meaning.
//
// Config is entirely env-driven (VISION_API_BASE_URL / VISION_API_KEY /
// VISION_MODEL) so the model id is never hardcoded and the provider can swap.
// This file is an I/O boundary with NO side effects: it returns a draft value,
// never persists. The image bytes and API key are NEVER logged.

import type { ZodType } from "zod";

import { extractJson } from "@/lib/json";

const TIMEOUT_MS = 30_000;
// Clients downscale before upload; anything larger is a misuse, not a real photo.
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_TOKENS_DEFAULT = 1024;
const RETRY_HINT =
  "\nYour previous reply was not valid JSON matching the schema; return only the JSON object.";

/**
 * A vision request failed in a way the caller can surface. Messages are short and
 * generic ON PURPOSE — they never include the provider's response body or the API
 * key. Standalone (not a DomainError): a provider outage/timeout is upstream, not
 * a client-input problem.
 */
export class VisionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VisionError";
  }
}

interface VisionConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

function config(): VisionConfig {
  const baseUrl = process.env.VISION_API_BASE_URL;
  const apiKey = process.env.VISION_API_KEY;
  const model = process.env.VISION_MODEL;
  if (!baseUrl) throw new Error("VISION_API_BASE_URL is not set");
  if (!apiKey) throw new Error("VISION_API_KEY is not set");
  if (!model) throw new Error("VISION_MODEL is not set");
  // Tolerate a trailing slash on the base so we never emit `//chat/completions`.
  return { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey, model };
}

/** Decoded byte length of a `data:<mime>;base64,<data>` URL's payload. */
function decodedByteLength(imageDataUrl: string): number {
  const comma = imageDataUrl.indexOf(",");
  const b64 = comma === -1 ? imageDataUrl : imageDataUrl.slice(comma + 1);
  return Buffer.byteLength(b64, "base64");
}

/**
 * Analyze a single image and return data validated against `schema`.
 *
 * Posts the image plus `instruction` to `${VISION_API_BASE_URL}/chat/completions`
 * at temperature 0, requesting a JSON object. The reply is run through
 * `extractJson` then `schema.parse`; on a parse/validation miss it retries ONCE
 * with a corrective hint, then gives up with a `VisionError`. A non-2xx response
 * or the 30s timeout also throws `VisionError`, never leaking the raw provider
 * error or the API key.
 *
 * No side effects: the returned value is a draft for the caller to confirm/persist.
 */
export async function analyzeImage<T>(args: {
  imageDataUrl: string;
  instruction: string;
  schema: ZodType<T>;
  maxTokens?: number;
}): Promise<T> {
  const { imageDataUrl, instruction, schema } = args;
  const maxTokens = args.maxTokens ?? MAX_TOKENS_DEFAULT;

  if (decodedByteLength(imageDataUrl) > MAX_BYTES) {
    throw new VisionError("image too large");
  }

  const { baseUrl, apiKey, model } = config();
  const baseText = `${instruction}\nReturn ONLY JSON, no prose.`;

  for (let attempt = 0; attempt < 2; attempt++) {
    const text = attempt === 0 ? baseText : baseText + RETRY_HINT;
    const content = await requestCompletion({
      baseUrl,
      apiKey,
      model,
      maxTokens,
      text,
      imageDataUrl,
    });
    try {
      return schema.parse(extractJson(content));
    } catch {
      // Invalid JSON or schema mismatch: retry once, then fail below.
    }
  }

  throw new VisionError("vision returned invalid JSON");
}

interface CompletionArgs extends VisionConfig {
  maxTokens: number;
  text: string;
  imageDataUrl: string;
}

/** One chat-completions round-trip; returns the assistant message text. */
async function requestCompletion(args: CompletionArgs): Promise<string> {
  const { baseUrl, apiKey, model, maxTokens, text, imageDataUrl } = args;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      // Vision replies are one-shot; never let a fetch cache serve a stale answer.
      cache: "no-store",
      signal: controller.signal,
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: maxTokens,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text },
              { type: "image_url", image_url: { url: imageDataUrl } },
            ],
          },
        ],
      }),
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new VisionError("vision request timed out");
    }
    // Network/transport failure — stay generic so nothing sensitive leaks.
    throw new VisionError("vision request failed");
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    throw new VisionError(`vision request failed (${res.status})`);
  }

  let body: { choices?: { message?: { content?: unknown } }[] };
  try {
    body = (await res.json()) as typeof body;
  } catch {
    throw new VisionError("vision returned an unreadable response");
  }

  const content = body.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new VisionError("vision returned no content");
  }
  return content;
}
