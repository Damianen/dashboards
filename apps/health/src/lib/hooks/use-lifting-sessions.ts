"use client";

import { useQuery } from "@tanstack/react-query";

import { getJSON } from "@/lib/fetcher";
import { queryKeys } from "@/lib/hooks/keys";
// Type-only import: erased at build time, so no server code is bundled.
import type { SessionView } from "@/server/services/lifting";

/**
 * The shape the client actually receives: Dates serialise to ISO strings over
 * HTTP. weightKg/rpe are already numbers (the service coerced Prisma.Decimal).
 */
export type SessionDTO = Omit<SessionView, "startedAt" | "endedAt"> & {
  startedAt: string;
  endedAt: string | null;
};

/** Recent sessions when `day` is omitted; that day's sessions when given. */
export function useLiftingSessions(day?: string) {
  const qs = day ? `?day=${encodeURIComponent(day)}` : "";
  return useQuery({
    queryKey: queryKeys.liftingSessions(day),
    queryFn: () => getJSON<SessionDTO[]>(`/api/lifting/sessions${qs}`),
  });
}
