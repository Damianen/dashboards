import { NotFoundError } from "@/server/services/errors";

/** Maps a service error to a JSON Response: NotFoundError → 404, anything else → 500. */
export function jsonError(err: unknown): Response {
  if (err instanceof NotFoundError) {
    return Response.json({ error: err.message }, { status: 404 });
  }
  console.error(err);
  return Response.json({ error: "internal" }, { status: 500 });
}
