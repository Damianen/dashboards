// Tokenizer. Splits a filter string into structural operators (& | ! ( )) and
// TERM runs. A TERM is the maximal run of text between top-level operators —
// so multi-word terms like `date before: next monday` stay a single token. A
// double-quoted span (`#"My Project"`) protects operators and spaces inside it;
// the quotes are kept in the token value for the term classifier to strip.

import { FilterParseError } from "./errors";

export type TokenType =
  | "AND"
  | "OR"
  | "NOT"
  | "LPAREN"
  | "RPAREN"
  | "TERM";

export interface Token {
  type: TokenType;
  /** Raw term text (trimmed, quotes preserved); "" for structural tokens. */
  value: string;
  /** 0-based column of the token's first char. */
  start: number;
  /** Column just past the token's last char (exclusive). */
  end: number;
}

const STRUCTURAL: Record<string, TokenType> = {
  "&": "AND",
  "|": "OR",
  "!": "NOT",
  "(": "LPAREN",
  ")": "RPAREN",
};

function isWhitespace(c: string): boolean {
  return c === " " || c === "\t" || c === "\n" || c === "\r";
}

export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  const n = input.length;
  let i = 0;

  while (i < n) {
    // Whitespace between tokens is insignificant.
    if (isWhitespace(input[i])) {
      i++;
      continue;
    }

    const structural = STRUCTURAL[input[i]];
    if (structural) {
      tokens.push({ type: structural, value: "", start: i, end: i + 1 });
      i++;
      continue;
    }

    // A TERM: scan until a top-level operator/paren or EOF, respecting quotes.
    const start = i;
    let inQuote = false;
    let quoteOpen = -1;
    let j = i;
    while (j < n) {
      const c = input[j];
      if (c === '"') {
        if (inQuote) {
          inQuote = false;
        } else {
          inQuote = true;
          quoteOpen = j;
        }
        j++;
        continue;
      }
      if (!inQuote && STRUCTURAL[c]) break;
      j++;
    }
    if (inQuote)
      throw new FilterParseError("unterminated quote", quoteOpen, input);

    // Trim trailing whitespace from the run (leading was already skipped).
    let end = j;
    while (end > start && isWhitespace(input[end - 1])) end--;
    tokens.push({
      type: "TERM",
      value: input.slice(start, end),
      start,
      end,
    });
    i = j;
  }

  return tokens;
}
