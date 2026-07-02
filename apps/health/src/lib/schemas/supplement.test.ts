import { describe, expect, it } from "vitest";

import {
  checkSchema,
  createSupplementSchema,
  groupCheckSchema,
  reorderSupplementsSchema,
} from "./supplement";

const CUID = "cflx0a1b2c3d4e5f6g7h8i9j";

describe("createSupplementSchema", () => {
  const base = {
    name: "Creatine",
    dose: 5,
    unit: "g",
    timeGroup: "MORNING",
  };

  it("accepts a caffeine-free supplement (caffeineMg optional)", () => {
    expect(createSupplementSchema.safeParse(base).success).toBe(true);
  });

  it("rejects a zero dose (gt, not gte)", () => {
    expect(createSupplementSchema.safeParse({ ...base, dose: 0 }).success).toBe(
      false,
    );
  });

  it("caps dose at the Decimal(8,2) bound 999999.99", () => {
    expect(
      createSupplementSchema.safeParse({ ...base, dose: 999999.99 }).success,
    ).toBe(true);
    expect(
      createSupplementSchema.safeParse({ ...base, dose: 1000000 }).success,
    ).toBe(false);
  });

  it("bounds caffeineMg to [0, 99999.9]", () => {
    expect(
      createSupplementSchema.safeParse({ ...base, caffeineMg: 0 }).success,
    ).toBe(true);
    expect(
      createSupplementSchema.safeParse({ ...base, caffeineMg: -1 }).success,
    ).toBe(false);
    expect(
      createSupplementSchema.safeParse({ ...base, caffeineMg: 100000 })
        .success,
    ).toBe(false);
  });

  it("rejects an unknown timeGroup literal", () => {
    expect(
      createSupplementSchema.safeParse({ ...base, timeGroup: "NOON" }).success,
    ).toBe(false);
  });

  it("rejects unknown keys (strictObject)", () => {
    expect(
      createSupplementSchema.safeParse({ ...base, bogus: 1 }).success,
    ).toBe(false);
  });
});

describe("reorderSupplementsSchema", () => {
  it("accepts a time-group with at least one cuid", () => {
    expect(
      reorderSupplementsSchema.safeParse({ timeGroup: "EVENING", ids: [CUID] })
        .success,
    ).toBe(true);
  });

  it("rejects an empty ids list", () => {
    expect(
      reorderSupplementsSchema.safeParse({ timeGroup: "EVENING", ids: [] })
        .success,
    ).toBe(false);
  });

  it("rejects non-cuid ids", () => {
    expect(
      reorderSupplementsSchema.safeParse({
        timeGroup: "EVENING",
        ids: ["not-a-cuid"],
      }).success,
    ).toBe(false);
  });
});

describe("checkSchema day format", () => {
  it("accepts a valid YYYY-MM-DD day and allows omitting it", () => {
    expect(
      checkSchema.safeParse({ supplementId: CUID, day: "2026-07-02" }).success,
    ).toBe(true);
    expect(checkSchema.safeParse({ supplementId: CUID }).success).toBe(true);
  });

  it("rejects a non-zero-padded day", () => {
    expect(
      checkSchema.safeParse({ supplementId: CUID, day: "2026-1-1" }).success,
    ).toBe(false);
  });

  it("rejects a well-formed but impossible calendar date", () => {
    expect(
      checkSchema.safeParse({ supplementId: CUID, day: "2026-13-01" }).success,
    ).toBe(false);
  });
});

describe("groupCheckSchema", () => {
  it("accepts a time-group with an optional day", () => {
    expect(
      groupCheckSchema.safeParse({ timeGroup: "PRE_WORKOUT" }).success,
    ).toBe(true);
    expect(
      groupCheckSchema.safeParse({
        timeGroup: "PRE_WORKOUT",
        day: "2026-07-02",
      }).success,
    ).toBe(true);
  });

  it("rejects a bad time-group", () => {
    expect(groupCheckSchema.safeParse({ timeGroup: "NIGHT" }).success).toBe(
      false,
    );
  });
});
