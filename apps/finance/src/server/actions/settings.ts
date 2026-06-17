"use server";

import { revalidatePath } from "next/cache";

import { Prisma } from "@/generated/prisma/client";
import { settingUpdateSchema, type SettingUpdateInput } from "@/lib/schemas";
import { setLargeTxnThreshold } from "@/server/services/settings";

// Thin adapter: validate the threshold (the Zod schema is the source of truth)
// and persist it as a Decimal.
export async function updateLargeTxnThreshold(
  input: SettingUpdateInput,
): Promise<void> {
  const data = settingUpdateSchema.parse(input);
  await setLargeTxnThreshold(new Prisma.Decimal(data.largeTxnThreshold));
  revalidatePath("/settings");
}
