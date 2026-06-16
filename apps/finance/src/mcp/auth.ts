import { timingSafeEqual } from "node:crypto";

/**
 * True iff `header` is exactly "Bearer <expected>", compared in constant time.
 *
 * A length mismatch returns false WITHOUT calling timingSafeEqual (it throws on
 * unequal-length buffers). A missing/empty `expected` (token not configured) also
 * rejects, so the server can never be reached with auth effectively disabled.
 */
export function verifyBearer(
  header: string | null,
  expected: string | undefined,
): boolean {
  if (!expected) return false;
  if (!header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(`Bearer ${expected}`);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
