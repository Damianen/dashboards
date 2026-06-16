import { NextResponse } from "next/server";

import { listBudgetsWithProgress } from "@/server/services/budgets";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const data = await listBudgetsWithProgress();
  return NextResponse.json(data);
}
