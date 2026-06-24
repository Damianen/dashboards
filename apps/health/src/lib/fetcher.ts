// Tiny typed fetch helpers for the client. Route handlers return JSON and use
// non-2xx status codes for errors (see src/lib/api.ts), so we throw on !ok.

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new HttpError(res.status, `GET ${url} failed`);
  return res.json() as Promise<T>;
}

export async function postJSON<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new HttpError(res.status, `POST ${url} failed`);
  return res.json() as Promise<T>;
}

export async function patchJSON<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new HttpError(res.status, `PATCH ${url} failed`);
  return res.json() as Promise<T>;
}

export async function delJSON<T>(url: string): Promise<T> {
  const res = await fetch(url, { method: "DELETE" });
  if (!res.ok) throw new HttpError(res.status, `DELETE ${url} failed`);
  return res.json() as Promise<T>;
}

/** DELETE for endpoints that reply 204 No Content (nothing to parse). */
export async function del(url: string): Promise<void> {
  const res = await fetch(url, { method: "DELETE" });
  if (!res.ok) throw new HttpError(res.status, `DELETE ${url} failed`);
}
