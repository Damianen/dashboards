import type { RuleField, RuleMatch } from "@/generated/prisma/client";

// CategoryRule engine. Rules are DATA in the DB (never hardcoded). Each rule
// matches one field (merchant | counterparty_iban | description) with one
// strategy (contains | regex | exact). Lower priority number wins; the first
// matching rule decides the category. Pure: no DB access here.

export interface Rule {
  categoryId: string;
  priority: number;
  field: RuleField;
  match: RuleMatch;
  value: string;
}

export interface RuleContext {
  merchantKey: string | null;
  counterpartyIban: string | null;
  descriptionRaw: string | null;
}

function subjectFor(field: RuleField, ctx: RuleContext): string | null {
  switch (field) {
    case "merchant":
      return ctx.merchantKey;
    case "counterparty_iban":
      return ctx.counterpartyIban;
    case "description":
      return ctx.descriptionRaw;
    default:
      return null;
  }
}

export function matchRule(rule: Rule, ctx: RuleContext): boolean {
  // An empty value would match everything — treat it as no-match so a malformed
  // rule can never swallow the whole inbox.
  if (!rule.value) return false;
  const subject = subjectFor(rule.field, ctx);
  if (!subject) return false;

  switch (rule.match) {
    case "contains":
      return subject.toLowerCase().includes(rule.value.toLowerCase());
    case "exact":
      return subject.toLowerCase() === rule.value.toLowerCase();
    case "regex":
      try {
        // Invalid or catastrophic patterns must never throw out of here.
        return new RegExp(rule.value, "i").test(subject);
      } catch {
        return false;
      }
    default:
      return false;
  }
}

/**
 * First matching rule's categoryId, or null. Sorted defensively by priority
 * (ascending) so callers can pass rules in any order; equal priorities keep
 * input order (stable sort).
 */
export function pickCategory(rules: Rule[], ctx: RuleContext): string | null {
  const ordered = [...rules].sort((a, b) => a.priority - b.priority);
  for (const rule of ordered) {
    if (matchRule(rule, ctx)) return rule.categoryId;
  }
  return null;
}
