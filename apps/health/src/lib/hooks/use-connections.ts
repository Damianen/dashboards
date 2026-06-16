"use client";

import { useQuery } from "@tanstack/react-query";

import { getJSON } from "@/lib/fetcher";
import { queryKeys } from "@/lib/hooks/keys";
// Type-only import: erased at build time, so no server code is bundled.
import type { Connection } from "@/server/services/connections";

export type { Connection };

export function useConnections() {
  return useQuery({
    queryKey: queryKeys.connections(),
    queryFn: () => getJSON<Connection[]>("/api/connections"),
  });
}
