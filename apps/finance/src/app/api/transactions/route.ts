import { NextResponse, type NextRequest } from "next/server";

import { listTransactions } from "@/server/services/transactions";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const page = await listTransactions({ cursor: searchParams.get("cursor") });
  return NextResponse.json(page);
}
