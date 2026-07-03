// Tiny typed fetch helpers for the client. Route handlers return JSON and use
// non-2xx status codes for errors (see src/lib/api.ts), so we throw on !ok.

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    /** Parsed JSON error body when the response had one ({ error } or a Zod
     *  flatten); null when the body wasn't JSON. Lets callers surface inline
     *  field errors without hand-rolling fetch. */
    public body: unknown = null,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

async function errorBody(res: Response): Promise<unknown> {
  return res.json().catch(() => null);
}

/** Server's { error } body when present and a non-empty string, else the fallback. */
export function httpErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof HttpError && typeof err.body === "object" && err.body !== null) {
    const { error } = err.body as { error?: unknown };
    if (typeof error === "string" && error.length > 0) {
      return error;
    }
  }
  return fallback;
}

/** Shared verb core: JSON-encodes `body` when given (body === undefined means
 *  no Content-Type header and no request body, e.g. GET/DELETE), throws
 *  HttpError on non-2xx, and parses the JSON response. */
async function requestJSON<T>(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  url: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(
    url,
    body === undefined
      ? { method }
      : {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  if (!res.ok) {
    throw new HttpError(
      res.status,
      `${method} ${url} failed`,
      await errorBody(res),
    );
  }
  return res.json() as Promise<T>;
}

export async function getJSON<T>(url: string): Promise<T> {
  return requestJSON<T>("GET", url);
}

export async function postJSON<T>(url: string, body: unknown): Promise<T> {
  return requestJSON<T>("POST", url, body);
}

export async function putJSON<T>(url: string, body: unknown): Promise<T> {
  return requestJSON<T>("PUT", url, body);
}

export async function patchJSON<T>(url: string, body: unknown): Promise<T> {
  return requestJSON<T>("PATCH", url, body);
}

export async function delJSON<T>(url: string): Promise<T> {
  return requestJSON<T>("DELETE", url);
}

/** DELETE for endpoints that reply 204 No Content (nothing to parse). */
export async function del(url: string): Promise<void> {
  const res = await fetch(url, { method: "DELETE" });
  if (!res.ok) {
    throw new HttpError(
      res.status,
      `DELETE ${url} failed`,
      await errorBody(res),
    );
  }
}
