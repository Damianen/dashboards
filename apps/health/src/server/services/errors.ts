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
