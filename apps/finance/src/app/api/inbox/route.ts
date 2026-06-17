import { NextResponse, type NextRequest } from "next/server";

import { listInbox } from "@/server/services/inbox";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const page = await listInbox({ cursor: searchParams.get("cursor") });
  return NextResponse.json(page);
}
