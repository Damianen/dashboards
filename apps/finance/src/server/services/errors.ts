// Domain errors thrown by the service layer. Adapters (server actions, route
// handlers, MCP tools) map these to their own error shapes; never throw raw
// strings.

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

/** Enable Banking is not configured (no app id / key / redirect). */
export class NotConfiguredError extends DomainError {}

/** Operation not allowed on this entity in its current state. */
export class InvalidOperationError extends DomainError {}
