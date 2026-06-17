import { NextResponse } from "next/server";

import { listCategories } from "@/server/services/categories";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const categories = await listCategories();
  return NextResponse.json(categories);
}
