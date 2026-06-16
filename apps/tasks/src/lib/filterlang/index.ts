// Todoist-style filter language: tokenizer -> parser -> AST -> evaluator that
// compiles to an in-memory predicate. Pure and browser-safe (chrono-node is the
// only dependency, used for `date before/after:` phrases).
//
//   expr    := or
//   or      := and ("|" and)*
//   and     := not ("&" not)*
//   not     := "!" not | primary
//   primary := "(" expr ")" | term
//
// Terms (case-insensitive): today, tomorrow, overdue, "no date", "no label",
// p1..p4, #Project, @label, /section ("quoted names" with spaces),
// search: <text>, date before: <when>, date after: <when>, next N days.

import type { FilterContext, FilterTask } from "./ast";
import { compile } from "./evaluate";
import { parse } from "./parser";
import { tokenize } from "./tokenizer";

export { FilterParseError } from "./errors";
export { tokenize, type Token, type TokenType } from "./tokenizer";
export { parse } from "./parser";
export { compile } from "./evaluate";
export type {
  FilterNode,
  TermNode,
  FilterTask,
  FilterContext,
} from "./ast";

/**
 * Parse and compile a filter string into a predicate. Throws FilterParseError
 * (with the offending column) on a tokenize, parse, or date-resolution failure.
 */
export function compileFilter(
  input: string,
  ctx: FilterContext,
): (task: FilterTask) => boolean {
  return compile(parse(tokenize(input), input), ctx, input);
}
