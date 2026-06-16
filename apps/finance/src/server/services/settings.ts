import { Prisma } from "@/generated/prisma/client";
import { DEFAULT_LARGE_TXN_THRESHOLD_EUR, SETTING_KEYS } from "@/lib/settings";
import { prisma } from "@/server/db";

// Typed accessors over the generic Setting key/value table.

export async function getSetting(key: string): Promise<string | null> {
  const row = await prisma.setting.findUnique({ where: { key } });
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await prisma.setting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}

/** Large-transaction alert threshold (EUR). Defaults to 250 when unset/invalid. */
export async function getLargeTxnThreshold(): Promise<Prisma.Decimal> {
  const raw = await getSetting(SETTING_KEYS.largeTxnThresholdEur);
  try {
    return new Prisma.Decimal(raw ?? DEFAULT_LARGE_TXN_THRESHOLD_EUR);
  } catch {
    return new Prisma.Decimal(DEFAULT_LARGE_TXN_THRESHOLD_EUR);
  }
}

export async function setLargeTxnThreshold(value: Prisma.Decimal): Promise<void> {
  await setSetting(SETTING_KEYS.largeTxnThresholdEur, value.toFixed(2));
}
