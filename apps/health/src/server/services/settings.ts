import { proteinSettingSchema } from "@/lib/schemas/settings";
import { prisma } from "@/server/db";

/** The default protein factor (g/kg) when the setting has never been written. */
export const DEFAULT_PROTEIN_G_PER_KG = 2.0;

/** The configured protein-target factor (g/kg), or the default if unset. Mirrors the
 *  settings-read pattern in water.ts. */
export async function getProteinGPerKg(): Promise<number> {
  const setting = await prisma.setting.findUnique({
    where: { key: "protein.gPerKg" },
  });
  return setting ? Number(setting.value) : DEFAULT_PROTEIN_G_PER_KG;
}

/** Persist the protein-target factor (g/kg). Validates against the canonical schema. */
export async function setProteinGPerKg(gPerKg: number): Promise<number> {
  const { gPerKg: value } = proteinSettingSchema.parse({ gPerKg });
  await prisma.setting.upsert({
    where: { key: "protein.gPerKg" },
    create: { key: "protein.gPerKg", value },
    update: { value },
  });
  return value;
}
