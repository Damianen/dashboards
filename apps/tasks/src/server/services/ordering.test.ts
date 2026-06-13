import { generateKeyBetween } from "fractional-indexing";
import { describe, expect, it } from "vitest";

import { NotFoundError } from "./errors";
import {
  compareOrder,
  resolveNeighborOrders,
  type OrderedItem,
} from "./ordering";

function items(...orders: string[]): OrderedItem[] {
  return orders.map((order, i) => ({ id: `id${i}`, order }));
}

describe("resolveNeighborOrders", () => {
  it("appends to an empty list", () => {
    expect(resolveNeighborOrders([], {})).toEqual({ lower: null, upper: null });
  });

  it("appends after the last sibling when no ref is given", () => {
    expect(resolveNeighborOrders(items("a0", "a1"), {})).toEqual({
      lower: "a1",
      upper: null,
    });
  });

  it("places before the list head with a null lower bound", () => {
    expect(
      resolveNeighborOrders(items("a0", "a1"), { beforeId: "id0" }),
    ).toEqual({ lower: null, upper: "a0" });
  });

  it("places before a middle sibling, after its predecessor", () => {
    expect(
      resolveNeighborOrders(items("a0", "a1", "a2"), { beforeId: "id2" }),
    ).toEqual({ lower: "a1", upper: "a2" });
  });

  it("places after a sibling, before its successor", () => {
    expect(
      resolveNeighborOrders(items("a0", "a1", "a2"), { afterId: "id0" }),
    ).toEqual({ lower: "a0", upper: "a1" });
  });

  it("places after the last sibling with a null upper bound", () => {
    expect(
      resolveNeighborOrders(items("a0", "a1"), { afterId: "id1" }),
    ).toEqual({ lower: "a1", upper: null });
  });

  it("uses both bounds when beforeId and afterId are given", () => {
    expect(
      resolveNeighborOrders(items("a0", "a1", "a2"), {
        afterId: "id0",
        beforeId: "id1",
      }),
    ).toEqual({ lower: "a0", upper: "a1" });
  });

  it("throws NotFoundError for an unknown sibling id", () => {
    expect(() =>
      resolveNeighborOrders(items("a0"), { beforeId: "nope" }),
    ).toThrow(NotFoundError);
    expect(() =>
      resolveNeighborOrders(items("a0"), { afterId: "nope" }),
    ).toThrow(NotFoundError);
  });
});

describe("round-trip with generateKeyBetween", () => {
  it("keeps the list sorted across repeated insertions", () => {
    const list: OrderedItem[] = [];
    for (let i = 0; i < 20; i++) {
      // Rotate through head, middle, and tail placements.
      const ref =
        list.length === 0
          ? {}
          : i % 3 === 0
            ? { beforeId: list[0].id }
            : i % 3 === 1
              ? { afterId: list[Math.floor(list.length / 2)].id }
              : {};
      const { lower, upper } = resolveNeighborOrders(list, ref);
      list.push({ id: `n${i}`, order: generateKeyBetween(lower, upper) });
      list.sort((a, b) => compareOrder(a.order, b.order));
    }
    const orders = list.map((x) => x.order);
    expect([...orders].sort((a, b) => compareOrder(a, b))).toEqual(orders);
    expect(new Set(orders).size).toBe(20);
  });
});
