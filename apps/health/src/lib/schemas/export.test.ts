import { describe, expect, it } from "vitest";

import {
  exportDomainSchema,
  exportQuerySchema,
  TIME_SERIES_DOMAINS,
} from "./export";

describe("exportQuerySchema", () => {
  it("defaults to all 16 domains with include_raw true", () => {
    const parsed = exportQuerySchema.parse({});
    expect(parsed.domains).toEqual([...exportDomainSchema.options]);
    expect(parsed.domains).toHaveLength(16);
    expect(parsed.include_raw).toBe(true);
    expect(parsed.from).toBeUndefined();
    expect(parsed.to).toBeUndefined();
  });

  it("splits a comma-separated list, trimming and deduplicating", () => {
    const parsed = exportQuerySchema.parse({
      domains: "weight, water,weight,lifting",
    });
    expect(parsed.domains).toEqual(["weight", "water", "lifting"]);
  });

  it("rejects unknown domains and an empty list", () => {
    expect(
      exportQuerySchema.safeParse({ domains: "weight,bogus" }).success,
    ).toBe(false);
    expect(exportQuerySchema.safeParse({ domains: "," }).success).toBe(false);
  });

  it("parses include_raw as a query-string boolean", () => {
    expect(exportQuerySchema.parse({ include_raw: "false" }).include_raw).toBe(
      false,
    );
    expect(exportQuerySchema.parse({ include_raw: "true" }).include_raw).toBe(
      true,
    );
    expect(
      exportQuerySchema.safeParse({ include_raw: "banana" }).success,
    ).toBe(false);
  });

  it("accepts a valid range (and from alone) but rejects from > to", () => {
    expect(
      exportQuerySchema.safeParse({ from: "2026-06-01", to: "2026-06-30" })
        .success,
    ).toBe(true);
    expect(exportQuerySchema.safeParse({ from: "2026-06-01" }).success).toBe(
      true,
    );
    expect(
      exportQuerySchema.safeParse({ from: "2026-07-02", to: "2026-07-01" })
        .success,
    ).toBe(false);
    expect(exportQuerySchema.safeParse({ from: "01-07-2026" }).success).toBe(
      false,
    );
  });
});

describe("TIME_SERIES_DOMAINS", () => {
  it("holds exactly the ten day-ranged domains", () => {
    expect([...TIME_SERIES_DOMAINS].sort()).toEqual(
      [
        "weight",
        "sleep",
        "readiness",
        "activity",
        "workouts",
        "food",
        "water",
        "stimulants",
        "supplements",
        "lifting",
      ].sort(),
    );
    expect(TIME_SERIES_DOMAINS.has("templates")).toBe(false);
    expect(TIME_SERIES_DOMAINS.has("settings")).toBe(false);
  });
});
