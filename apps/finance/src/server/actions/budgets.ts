"use server";

import { revalidatePath } from "next/cache";

import type { BudgetUpsertInput } from "@/lib/schemas";
import {
  copyLastMonthBudgets,
  deleteBudget,
  upsertBudget,
} from "@/server/services/budgets";

// Thin adapters over the budgets service (validation lives in the service).
// The budgets client calls these as TanStack mutationFns.

export async function saveBudget(input: BudgetUpsertInput): Promise<void> {
  await upsertBudget(input);
  revalidatePath("/budgets");
  revalidatePath("/");
}

export async function removeBudget(id: string): Promise<void> {
  await deleteBudget({ id });
  revalidatePath("/budgets");
  revalidatePath("/");
}

export async function copyLastMonth(): Promise<{ copied: number }> {
  const result = await copyLastMonthBudgets();
  revalidatePath("/budgets");
  revalidatePath("/");
  return result;
}
