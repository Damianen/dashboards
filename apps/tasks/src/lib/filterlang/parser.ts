// Recursive-descent parser over the token stream. Grammar:
//   expr    := or
//   or      := and ("|" and)*
//   and     := not ("&" not)*
//   not     := "!" not | primary
//   primary := "(" expr ")" | term
// Precedence is ! > & > |; & and | are left-associative. Term strings are
// turned into typed AST leaves by classifyTerm, which is the layer that reports
// unknown/malformed terms (always pointing at the term's column).

import type { FilterNode, TermNode } from "./ast";
import { FilterParseError } from "./errors";
import type { Token, TokenType } from "./tokenizer";

const SYMBOL: Record<TokenType, string> = {
  AND: "&",
  OR: "|",
  NOT: "!",
  LPAREN: "(",
  RPAREN: ")",
  TERM: "",
};

function display(t: Token): string {
  return t.type === "TERM" ? t.value : SYMBOL[t.type];
}

/** Strip a single pair of surrounding double quotes, if present. */
function unquote(s: string): string {
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"'))
    return s.slice(1, -1);
  return s;
}

function classifyTerm(t: Token, input: string): TermNode {
  const raw = t.value;
  const start = t.start;

  const sigil = raw[0];
  if (sigil === "#" || sigil === "@" || sigil === "/") {
    const name = unquote(raw.slice(1).trim());
    if (name === "")
      throw new FilterParseError(`expected a name after "${sigil}"`, start, input);
    if (sigil === "#") return { kind: "project", name };
    if (sigil === "@") return { kind: "label", name };
    return { kind: "section", name };
  }

  const lower = raw.toLowerCase();
  const norm = lower.replace(/\s+/g, " ").trim();

  if (lower.startsWith("search:")) {
    const text = unquote(raw.slice("search:".length).trim());
    if (text === "")
      throw new FilterParseError("search: needs a search term", start, input);
    return { kind: "search", text };
  }
  if (lower.startsWith("date before:")) {
    const expr = unquote(raw.slice("date before:".length).trim());
    if (expr === "")
      throw new FilterParseError("date before: needs a date", start, input);
    return { kind: "dateBefore", expr, position: start };
  }
  if (lower.startsWith("date after:")) {
    const expr = unquote(raw.slice("date after:".length).trim());
    if (expr === "")
      throw new FilterParseError("date after: needs a date", start, input);
    return { kind: "dateAfter", expr, position: start };
  }

  if (norm === "no date") return { kind: "noDate" };
  if (norm === "no label") return { kind: "noLabel" };

  const nextMatch = /^next\s+(.+?)\s+days?$/.exec(norm);
  if (nextMatch) {
    const days = Number(nextMatch[1]);
    if (!Number.isInteger(days) || days < 1)
      throw new FilterParseError(
        "next N days: N must be a positive whole number",
        start,
        input,
      );
    return { kind: "nextNDays", days };
  }

  if (norm === "today") return { kind: "today" };
  if (norm === "tomorrow") return { kind: "tomorrow" };
  if (norm === "overdue") return { kind: "overdue" };

  const pri = /^p([1-4])$/.exec(norm);
  if (pri) return { kind: "priority", level: Number(pri[1]) as 1 | 2 | 3 | 4 };

  throw new FilterParseError(`unknown filter term: "${raw}"`, start, input);
}

class Parser {
  private pos = 0;
  constructor(
    private readonly tokens: Token[],
    private readonly input: string,
  ) {}

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private parseOr(): FilterNode {
    let left = this.parseAnd();
    while (this.peek()?.type === "OR") {
      this.pos++;
      left = { kind: "or", left, right: this.parseAnd() };
    }
    return left;
  }

  private parseAnd(): FilterNode {
    let left = this.parseNot();
    while (this.peek()?.type === "AND") {
      this.pos++;
      left = { kind: "and", left, right: this.parseNot() };
    }
    return left;
  }

  private parseNot(): FilterNode {
    if (this.peek()?.type === "NOT") {
      this.pos++;
      return { kind: "not", operand: this.parseNot() };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): FilterNode {
    const t = this.peek();
    if (!t)
      throw new FilterParseError("expected a term", this.input.length, this.input);
    if (t.type === "LPAREN") {
      this.pos++;
      const inner = this.parseOr();
      if (this.peek()?.type !== "RPAREN")
        throw new FilterParseError(
          "unbalanced parenthesis: missing ')'",
          t.start,
          this.input,
        );
      this.pos++;
      return inner;
    }
    if (t.type === "TERM") {
      this.pos++;
      return classifyTerm(t, this.input);
    }
    throw new FilterParseError(`unexpected "${display(t)}"`, t.start, this.input);
  }

  parse(): FilterNode {
    if (this.tokens.length === 0)
      throw new FilterParseError("empty filter", 0, this.input);
    const node = this.parseOr();
    const rest = this.peek();
    if (rest)
      throw new FilterParseError(
        `unexpected "${display(rest)}"`,
        rest.start,
        this.input,
      );
    return node;
  }
}

export function parse(tokens: Token[], input: string): FilterNode {
  return new Parser(tokens, input).parse();
}
