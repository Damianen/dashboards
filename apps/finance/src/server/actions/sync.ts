"use server";

import { revalidatePath } from "next/cache";

import { syncAll, type SyncSummary } from "@/server/services/sync";

// User-present "Sync now": exempt from the unattended PSD2 budget (see
// apps/finance/CLAUDE.md). Thin wrapper over the sync service.
export async function syncNow(): Promise<SyncSummary> {
  const summary = await syncAll();
  revalidatePath("/transactions");
  revalidatePath("/settings");
  return summary;
}
