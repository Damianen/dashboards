import { describe, expect, it } from "vitest";

import { FilterParseError } from "./errors";
import { tokenize, type TokenType } from "./tokenizer";

type Tuple = [TokenType, string, number, number];

interface TokCase {
  name: string;
  input: string;
  tokens: Tuple[];
}

const cases: TokCase[] = [
  { name: "single bare term", input: "today", tokens: [["TERM", "today", 0, 5]] },
  {
    name: "term & term",
    input: "today & overdue",
    tokens: [
      ["TERM", "today", 0, 5],
      ["AND", "", 6, 7],
      ["TERM", "overdue", 8, 15],
    ],
  },
  {
    name: "operators need no surrounding space",
    input: "today&overdue",
    tokens: [
      ["TERM", "today", 0, 5],
      ["AND", "", 5, 6],
      ["TERM", "overdue", 6, 13],
    ],
  },
  {
    name: "leading not",
    input: "!@waiting",
    tokens: [
      ["NOT", "", 0, 1],
      ["TERM", "@waiting", 1, 9],
    ],
  },
  {
    name: "parens and or",
    input: "(today | overdue)",
    tokens: [
      ["LPAREN", "", 0, 1],
      ["TERM", "today", 1, 6],
      ["OR", "", 7, 8],
      ["TERM", "overdue", 9, 16],
      ["RPAREN", "", 16, 17],
    ],
  },
  {
    name: "quoted name protects the operator",
    input: '#"My Project" & today',
    tokens: [
      ["TERM", '#"My Project"', 0, 13],
      ["AND", "", 14, 15],
      ["TERM", "today", 16, 21],
    ],
  },
  {
    name: "quoted search value keeps & literal",
    input: 'search: "a & b"',
    tokens: [["TERM", 'search: "a & b"', 0, 15]],
  },
  {
    name: "multi-word date term stays one token",
    input: "date before: next monday",
    tokens: [["TERM", "date before: next monday", 0, 24]],
  },
];

describe("tokenize", () => {
  it.each(cases)("$name", (c) => {
    const actual = tokenize(c.input).map(
      (t): Tuple => [t.type, t.value, t.start, t.end],
    );
    expect(actual).toEqual(c.tokens);
  });

  it("returns [] for whitespace-only input", () => {
    expect(tokenize("   ")).toEqual([]);
  });

  it("throws at the opening quote on an unterminated quote", () => {
    let err: unknown;
    try {
      tokenize('#"My Project');
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(FilterParseError);
    expect((err as FilterParseError).position).toBe(1);
  });
});
