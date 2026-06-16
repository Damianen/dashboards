"use server";

import { revalidatePath } from "next/cache";

import type { CategorizeInput } from "@/lib/schemas";
import {
  categorizeTransaction,
  rerunRulesOnUncategorized,
  type CategorizeResult,
} from "@/server/services/categorize";

// Thin adapters over the categorization service. Validation lives in the service
// (Zod). The inbox client calls `categorize` as a TanStack mutationFn.
export async function categorize(
  input: CategorizeInput,
): Promise<CategorizeResult> {
  const result = await categorizeTransaction(input);
  revalidatePath("/inbox");
  revalidatePath("/");
  return result;
}

export async function rerunRules(): Promise<{
  scanned: number;
  categorized: number;
}> {
  const result = await rerunRulesOnUncategorized();
  revalidatePath("/inbox");
  revalidatePath("/");
  return result;
}
