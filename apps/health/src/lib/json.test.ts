import { describe, expect, it } from "vitest";

import { extractJson } from "./json";

describe("extractJson", () => {
  it("parses a bare JSON object", () => {
    expect(extractJson('{"a": 1, "b": "two"}')).toEqual({ a: 1, b: "two" });
  });

  it("parses a bare JSON array", () => {
    expect(extractJson("[1, 2, 3]")).toEqual([1, 2, 3]);
  });

  it("parses a ```json fenced block", () => {
    const text = 'Here you go:\n```json\n{"kcal": 250}\n```';
    expect(extractJson(text)).toEqual({ kcal: 250 });
  });

  it("parses a bare ``` fenced block", () => {
    const text = "```\n[true, false]\n```";
    expect(extractJson(text)).toEqual([true, false]);
  });

  it("parses JSON after leading prose", () => {
    const text = 'Sure! The result is {"ok": true} — hope that helps.';
    expect(extractJson(text)).toEqual({ ok: true });
  });

  it("parses JSON with trailing prose", () => {
    const text = '{"items": [{"n": 1}]}\nLet me know if you need more.';
    expect(extractJson(text)).toEqual({ items: [{ n: 1 }] });
  });

  it("ignores braces inside string values when balancing", () => {
    const text = 'note: {"text": "a } b ] c", "ok": true}';
    expect(extractJson(text)).toEqual({ text: "a } b ] c", ok: true });
  });

  it("throws when there is no JSON", () => {
    expect(() => extractJson("just some prose, nothing structured")).toThrow();
  });

  it("throws when the candidate is not valid JSON", () => {
    expect(() => extractJson("{not: valid, json]")).toThrow();
  });
});
