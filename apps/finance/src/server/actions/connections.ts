"use server";

import { redirect } from "next/navigation";

import { Bank } from "@/generated/prisma/client";
import { startBankAuth } from "@/server/services/connections";
import { isConfigured } from "@/server/services/enable-banking/config";

// Thin form action: kick off a bank connection and redirect the browser to the
// bank's authorization page. Business logic lives in the connections service.

function parseBank(value: FormDataEntryValue | null): Bank | null {
  if (value === Bank.ING) return Bank.ING;
  if (value === Bank.REVOLUT) return Bank.REVOLUT;
  return null;
}

export async function startConnect(formData: FormData): Promise<void> {
  const bank = parseBank(formData.get("bank"));
  if (!bank) redirect("/settings?error=bad_bank");
  if (!isConfigured()) redirect("/settings?error=not_configured");

  let url: string;
  try {
    url = await startBankAuth(bank);
  } catch {
    // The service already recorded the error against the pending connection.
    redirect("/settings?error=connect_failed");
  }
  redirect(url);
}
