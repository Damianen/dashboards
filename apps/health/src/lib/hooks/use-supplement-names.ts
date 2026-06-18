"use client";

import { useQuery } from "@tanstack/react-query";

import { getJSON } from "@/lib/fetcher";
import { queryKeys } from "@/lib/hooks/keys";

export function useSupplementNames() {
  return useQuery({
    queryKey: queryKeys.supplementNames(),
    queryFn: () => getJSON<string[]>("/api/supplements/names"),
    staleTime: 5 * 60_000,
  });
}
