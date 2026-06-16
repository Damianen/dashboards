"use client";

import { useQuery } from "@tanstack/react-query";

import { getJSON } from "@/lib/fetcher";
import { queryKeys } from "@/lib/hooks/keys";
import type { WaterStatus } from "@/server/services/water";

export type { WaterStatus };

export function useWaterStatus(day: string) {
  return useQuery({
    queryKey: queryKeys.water(day),
    queryFn: () =>
      getJSON<WaterStatus>(`/api/water?day=${encodeURIComponent(day)}`),
  });
}
