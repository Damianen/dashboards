// Shared exact-then-fuzzy name resolution for MCP "by name" tools. Kept generic:
// the caller supplies the actual Prisma query, so this module stays model-agnostic
// and pure enough to unit-test with a stubbed finder.

/** A name predicate the caller can drop straight into a Prisma string filter. */
export interface NameFilter {
  equals?: string;
  contains?: string;
  mode: "insensitive";
}

/**
 * Resolve a record by (case-insensitive) name: a single exact match wins; otherwise
 * returns candidates (all exact-but-ambiguous hits, else up to `take` substring hits)
 * so the caller can disambiguate WITHOUT a side effect. `findByName` runs the actual
 * query — it must apply the filter to `name`, keep its own scoping (e.g. archived
 * exclusion) and ordering, and honour `take` when given.
 */
export async function resolveUniqueByName<
  T extends { id: string; name: string },
>(
  name: string,
  findByName: (filter: NameFilter, take?: number) => Promise<T[]>,
): Promise<{ match: T } | { candidates: Array<{ id: string; name: string }> }> {
  const q = name.trim();
  const exact = await findByName({ equals: q, mode: "insensitive" });
  const first = exact[0];
  if (exact.length === 1 && first) return { match: first };
  if (exact.length > 1) {
    return { candidates: exact.map((m) => ({ id: m.id, name: m.name })) };
  }
  const fuzzy = await findByName({ contains: q, mode: "insensitive" }, 10);
  return { candidates: fuzzy.map((m) => ({ id: m.id, name: m.name })) };
}
