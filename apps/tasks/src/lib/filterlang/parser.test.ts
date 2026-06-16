import { describe, expect, it } from "vitest";

import type { FilterNode } from "./ast";
import { FilterParseError } from "./errors";
import { parse } from "./parser";
import { tokenize } from "./tokenizer";

function ast(input: string): FilterNode {
  return parse(tokenize(input), input);
}

function parseError(input: string): FilterParseError {
  try {
    parse(tokenize(input), input);
  } catch (e) {
    if (e instanceof FilterParseError) return e;
    throw e;
  }
  throw new Error(`expected "${input}" to throw`);
}

const today: FilterNode = { kind: "today" };
const overdue: FilterNode = { kind: "overdue" };

interface AstCase {
  name: string;
  input: string;
  expected: FilterNode;
}

const astCases: AstCase[] = [
  {
    name: "& binds tighter than |",
    input: "today & overdue | p1",
    expected: {
      kind: "or",
      left: { kind: "and", left: today, right: overdue },
      right: { kind: "priority", level: 1 },
    },
  },
  {
    name: "! binds tighter than &",
    input: "!today & overdue",
    expected: {
      kind: "and",
      left: { kind: "not", operand: today },
      right: overdue,
    },
  },
  {
    name: "parens override precedence",
    input: "!(today | overdue)",
    expected: {
      kind: "not",
      operand: { kind: "or", left: today, right: overdue },
    },
  },
  {
    name: "acceptance expression (left-assoc &)",
    input: "(today | overdue) & #School & !@waiting",
    expected: {
      kind: "and",
      left: {
        kind: "and",
        left: { kind: "or", left: today, right: overdue },
        right: { kind: "project", name: "School" },
      },
      right: { kind: "not", operand: { kind: "label", name: "waiting" } },
    },
  },
];

describe("parse — structure", () => {
  it.each(astCases)("$name", (c) => {
    expect(ast(c.input)).toEqual(c.expected);
  });
});

interface TermCase {
  name: string;
  input: string;
  expected: FilterNode;
}

const termCases: TermCase[] = [
  { name: "priority", input: "p3", expected: { kind: "priority", level: 3 } },
  {
    name: "quoted project",
    input: '#"My Project"',
    expected: { kind: "project", name: "My Project" },
  },
  { name: "label", input: "@waiting", expected: { kind: "label", name: "waiting" } },
  { name: "section", input: "/Inbox", expected: { kind: "section", name: "Inbox" } },
  { name: "next N days", input: "next 3 days", expected: { kind: "nextNDays", days: 3 } },
  { name: "no date", input: "no date", expected: { kind: "noDate" } },
  { name: "no label", input: "no label", expected: { kind: "noLabel" } },
  { name: "search", input: "search: rent", expected: { kind: "search", text: "rent" } },
  {
    name: "date before keeps raw expr + position",
    input: "date before: tomorrow",
    expected: { kind: "dateBefore", expr: "tomorrow", position: 0 },
  },
  { name: "case-insensitive keyword", input: "OVERDUE", expected: { kind: "overdue" } },
];

describe("parse — term classification", () => {
  it.each(termCases)("$name", (c) => {
    expect(ast(c.input)).toEqual(c.expected);
  });
});

interface ErrCase {
  name: string;
  input: string;
  position: number;
}

const errCases: ErrCase[] = [
  { name: "empty filter", input: "", position: 0 },
  { name: "unbalanced paren", input: "(today | overdue", position: 0 },
  { name: "trailing operator", input: "today &", position: 7 },
  { name: "leading operator", input: "& today", position: 0 },
  { name: "term then unexpected group (no operator)", input: "today (overdue)", position: 6 },
  { name: "unknown term", input: "badterm", position: 0 },
  { name: "next 0 days", input: "next 0 days", position: 0 },
  { name: "next two days", input: "next two days", position: 0 },
  { name: "missing name after sigil", input: "#", position: 0 },
];

describe("parse — errors point at the offending token", () => {
  it.each(errCases)("$name", (c) => {
    const err = parseError(c.input);
    expect(err).toBeInstanceOf(FilterParseError);
    expect(err.position).toBe(c.position);
  });
});
