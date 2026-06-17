"use server";

import { revalidatePath } from "next/cache";

import { detectAndLinkTransfers } from "@/server/services/transfers";

// Backfill: re-run internal-transfer detection over all currently-unpaired rows.
// Sync runs this automatically; this is the manual/one-off entry point.
export async function backfillTransfers(): Promise<{ pairs: number }> {
  const result = await detectAndLinkTransfers();
  revalidatePath("/");
  revalidatePath("/transactions");
  return result;
}
