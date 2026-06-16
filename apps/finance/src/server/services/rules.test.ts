import { describe, expect, it } from "vitest";

import { matchRule, pickCategory, type Rule, type RuleContext } from "./rules";

function ctx(partial: Partial<RuleContext>): RuleContext {
  return {
    merchantKey: null,
    counterpartyIban: null,
    descriptionRaw: null,
    ...partial,
  };
}

function rule(partial: Partial<Rule> & Pick<Rule, "categoryId">): Rule {
  return {
    priority: 100,
    field: "merchant",
    match: "contains",
    value: "",
    ...partial,
  };
}

describe("matchRule", () => {
  it("contains is case-insensitive", () => {
    expect(
      matchRule(
        rule({ categoryId: "c", match: "contains", value: "COFFEE" }),
        ctx({ merchantKey: "coffee bar" }),
      ),
    ).toBe(true);
  });

  it("exact requires the whole string", () => {
    expect(
      matchRule(
        rule({ categoryId: "c", match: "exact", value: "coffee" }),
        ctx({ merchantKey: "coffee bar" }),
      ),
    ).toBe(false);
    expect(
      matchRule(
        rule({ categoryId: "c", match: "exact", value: "coffee bar" }),
        ctx({ merchantKey: "coffee bar" }),
      ),
    ).toBe(true);
  });

  it("regex uses the i flag", () => {
    expect(
      matchRule(
        rule({ categoryId: "c", field: "description", match: "regex", value: "^abn" }),
        ctx({ descriptionRaw: "ABN periodic payment" }),
      ),
    ).toBe(true);
  });

  it("invalid regex never throws and never matches", () => {
    expect(
      matchRule(
        rule({ categoryId: "c", field: "description", match: "regex", value: "[" }),
        ctx({ descriptionRaw: "anything" }),
      ),
    ).toBe(false);
  });

  it("matches the counterparty_iban field", () => {
    expect(
      matchRule(
        rule({
          categoryId: "c",
          field: "counterparty_iban",
          match: "contains",
          value: "nl12",
        }),
        ctx({ counterpartyIban: "NL12BANK0123456789" }),
      ),
    ).toBe(true);
  });

  it("a null target never matches", () => {
    expect(
      matchRule(
        rule({ categoryId: "c", match: "contains", value: "coffee" }),
        ctx({ merchantKey: null }),
      ),
    ).toBe(false);
  });

  it("an empty value never matches", () => {
    expect(
      matchRule(
        rule({ categoryId: "c", match: "contains", value: "" }),
        ctx({ merchantKey: "coffee bar" }),
      ),
    ).toBe(false);
  });
});

describe("pickCategory", () => {
  it("returns null with no rules", () => {
    expect(pickCategory([], ctx({ merchantKey: "coffee bar" }))).toBeNull();
  });

  it("lower priority number wins", () => {
    const rules = [
      rule({ categoryId: "eatingOut", priority: 20, value: "coffee" }),
      rule({ categoryId: "groceries", priority: 10, value: "coffee" }),
    ];
    expect(pickCategory(rules, ctx({ merchantKey: "coffee bar" }))).toBe(
      "groceries",
    );
  });

  it("equal priorities keep input order (stable)", () => {
    const rules = [
      rule({ categoryId: "first", priority: 100, value: "coffee" }),
      rule({ categoryId: "second", priority: 100, value: "coffee" }),
    ];
    expect(pickCategory(rules, ctx({ merchantKey: "coffee bar" }))).toBe("first");
  });

  it("returns null when nothing matches", () => {
    const rules = [rule({ categoryId: "x", value: "tea" })];
    expect(pickCategory(rules, ctx({ merchantKey: "coffee bar" }))).toBeNull();
  });
});
