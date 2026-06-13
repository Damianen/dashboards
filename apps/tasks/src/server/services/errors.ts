// Domain errors thrown by the service layer. Adapters (server actions, MCP
// tools) map these to their own error shapes; never throw raw strings.

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

export class NotImplementedError extends DomainError {}

/** Invalid reorder/move target: cycles, cross-project parents, bad neighbors. */
export class InvalidMoveError extends DomainError {}

/** Operation not allowed on this entity, e.g. deleting the Inbox. */
export class InvalidOperationError extends DomainError {}
