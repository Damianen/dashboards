// Domain errors thrown by services. Thin adapters (route handlers, future MCP tools)
// translate these into transport-level responses — see src/lib/api.ts.

export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends DomainError {
  constructor(entity: string, id?: string) {
    super(id ? `${entity} not found: ${id}` : `${entity} not found`);
  }
}

/**
 * An external feed (Open Food Facts, a vision provider) is unreachable or
 * misbehaving — the same request may succeed later. Distinct from NotFoundError
 * so an upstream outage is never reported as "not found": adapters map this to
 * 502, telling the client to retry rather than treat the data as missing.
 */
export class UpstreamUnavailableError extends DomainError {
  constructor(service: string, message?: string) {
    super(message ?? `${service} is unavailable — try again later`);
  }
}
