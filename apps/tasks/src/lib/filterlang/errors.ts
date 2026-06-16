// Filter-language parse/compile error. A plain Error subclass (NOT the server
// DomainError) so this module stays pure and browser-safe — just like
// RecurrenceParseError. It carries the 0-based column of the offending token so
// the UI and MCP can point right at it.

export class FilterParseError extends Error {
  /** 0-based column of the offending token in the original input. */
  readonly position: number;
  /** The original filter string, kept so callers can render a caret snippet. */
  readonly input: string;

  constructor(message: string, position: number, input: string) {
    super(message);
    this.name = "FilterParseError";
    this.position = position;
    this.input = input;
  }

  /**
   * Two-line caret pointing at `position`, e.g.
   *   today & badterm
   *           ^
   */
  caret(): string {
    return `${this.input}\n${" ".repeat(Math.max(0, this.position))}^`;
  }
}
