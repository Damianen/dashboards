import {
  DomainError,
  NotFoundError,
  UpstreamUnavailableError,
} from "@/server/services/errors";

/** Maps a service error to a JSON Response: NotFoundError → 404,
 *  UpstreamUnavailableError → 502 (an external feed is down — retryable, NOT a
 *  client error), any other DomainError → 400 (a client-fixable refusal, e.g. an
 *  archived template or a duplicate name), anything else → 500. The subclasses
 *  are checked before DomainError, which they extend. */
export function jsonError(err: unknown): Response {
  if (err instanceof NotFoundError) {
    return Response.json({ error: err.message }, { status: 404 });
  }
  if (err instanceof UpstreamUnavailableError) {
    return Response.json({ error: err.message }, { status: 502 });
  }
  if (err instanceof DomainError) {
    return Response.json({ error: err.message }, { status: 400 });
  }
  console.error(err);
  return Response.json({ error: "internal" }, { status: 500 });
}
