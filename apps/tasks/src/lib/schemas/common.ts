// Shared building blocks for all input schemas. These schemas are the single
// source of truth for inputs, reused by server actions AND MCP tools.

import { z } from "zod";

import { isValidTimeZone } from "@/lib/dates";

export const idSchema = z.string().min(1);

/** Placement target for reorders: relative to a sibling, or append when empty. */
export const orderRefSchema = z.strictObject({
  beforeId: idSchema.optional(),
  afterId: idSchema.optional(),
});
export type OrderRefInput = z.input<typeof orderRefSchema>;

/** 1 = p1 (highest) … 4 = p4 (default). */
export const prioritySchema = z.number().int().min(1).max(4);

export const colorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "hex color like #aabbcc");

export const timezoneSchema = z
  .string()
  .min(1)
  .refine(isValidTimeZone, "invalid IANA timezone");

export function hasAnyValue(v: Record<string, unknown>): boolean {
  return Object.values(v).some((x) => x !== undefined);
}
