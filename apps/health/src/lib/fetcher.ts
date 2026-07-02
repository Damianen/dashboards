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

export async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new HttpError(res.status, `GET ${url} failed`, await errorBody(res));
  }
  return res.json() as Promise<T>;
}

export async function postJSON<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new HttpError(res.status, `POST ${url} failed`, await errorBody(res));
  }
  return res.json() as Promise<T>;
}

export async function putJSON<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new HttpError(res.status, `PUT ${url} failed`, await errorBody(res));
  }
  return res.json() as Promise<T>;
}

export async function patchJSON<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new HttpError(
      res.status,
      `PATCH ${url} failed`,
      await errorBody(res),
    );
  }
  return res.json() as Promise<T>;
}

export async function delJSON<T>(url: string): Promise<T> {
  const res = await fetch(url, { method: "DELETE" });
  if (!res.ok) {
    throw new HttpError(
      res.status,
      `DELETE ${url} failed`,
      await errorBody(res),
    );
  }
  return res.json() as Promise<T>;
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
