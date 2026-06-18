"use client";

import { useQuery } from "@tanstack/react-query";

import { getJSON } from "@/lib/fetcher";
import { queryKeys } from "@/lib/hooks/keys";
// Type-only import: erased at build time, so no server code is bundled.
import type { SessionDetail } from "@/server/services/lifting";

/**
 * One session's full detail as the client receives it: Dates serialise to ISO
 * strings over HTTP. weightKg/rpe/volume are already numbers (the service coerced
 * Prisma.Decimal), so the exercises array is client-ready as-is.
 */
export type SessionDetailDTO = Omit<SessionDetail, "startedAt" | "endedAt"> & {
  startedAt: string;
  endedAt: string | null;
};

/** A session's plan + sets + progress, refetched after each logged set. */
export function useSession(id: string) {
  return useQuery({
    queryKey: queryKeys.session(id),
    queryFn: () => getJSON<SessionDetailDTO>(`/api/lifting/sessions/${id}`),
  });
}
