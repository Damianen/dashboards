// Pure neighbor resolution for fractional-indexing reorders. Services fetch
// the sorted sibling list (excluding the moving item), resolve the (lower,
// upper) bounds here, then call generateKeyBetween(lower, upper).

import { NotFoundError } from "./errors";

export interface OrderedItem {
  id: string;
  order: string;
}

export interface OrderRef {
  beforeId?: string;
  afterId?: string;
}

/** Fractional-indexing keys compare as plain code units — never localeCompare. */
export function compareOrder(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function indexOf(siblings: readonly OrderedItem[], id: string): number {
  const idx = siblings.findIndex((s) => s.id === id);
  if (idx === -1) throw new NotFoundError("sibling", id);
  return idx;
}

/**
 * Resolve generateKeyBetween bounds for placing an item among `siblings`.
 *
 * `siblings` must be sorted ascending by `order` and exclude the moving item.
 * - beforeId + afterId: between those two siblings
 * - afterId only: directly after it (before its current successor)
 * - beforeId only: directly before it (after its current predecessor)
 * - neither: append to the end
 */
export function resolveNeighborOrders(
  siblings: readonly OrderedItem[],
  ref: OrderRef,
): { lower: string | null; upper: string | null } {
  if (ref.afterId !== undefined && ref.beforeId !== undefined) {
    return {
      lower: siblings[indexOf(siblings, ref.afterId)].order,
      upper: siblings[indexOf(siblings, ref.beforeId)].order,
    };
  }
  if (ref.afterId !== undefined) {
    const idx = indexOf(siblings, ref.afterId);
    return {
      lower: siblings[idx].order,
      upper: siblings[idx + 1]?.order ?? null,
    };
  }
  if (ref.beforeId !== undefined) {
    const idx = indexOf(siblings, ref.beforeId);
    return {
      lower: idx > 0 ? siblings[idx - 1].order : null,
      upper: siblings[idx].order,
    };
  }
  return {
    lower: siblings.length > 0 ? siblings[siblings.length - 1].order : null,
    upper: null,
  };
}
