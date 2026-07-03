import type { Prisma } from "@/generated/prisma/client";

/** One sanctioned home for the Json-column double cast; call sites stay cast-free. */
export function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}
