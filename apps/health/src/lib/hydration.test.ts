import { describe, expect, it } from "vitest";

import { entryDayOf } from "./hydration";

describe("entryDayOf", () => {
  it("slices the civil day out of a serialized @db.Date value", () => {
    expect(entryDayOf("2026-07-02T00:00:00.000Z")).toBe("2026-07-02");
  });
});
