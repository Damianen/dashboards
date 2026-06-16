import type { CategoryListItem } from "@/lib/inbox";
import { prisma } from "@/server/db";

// Flat category list for the picker. Income categories first, then alphabetical,
// so the common income/expense split reads naturally in the bottom sheet.
export async function listCategories(): Promise<CategoryListItem[]> {
  const rows = await prisma.category.findMany({
    orderBy: [{ kind: "asc" }, { name: "asc" }],
    select: { id: true, name: true, kind: true, color: true },
  });
  return rows;
}
