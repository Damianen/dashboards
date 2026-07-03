"use client";

import { useQuery } from "@tanstack/react-query";

// Pure-lib type: the single source of truth the service composes into.
import type { Briefing } from "@/lib/briefing";
import { getJSON } from "@/lib/fetcher";
import { queryKeys } from "@/lib/hooks/keys";
import type { BriefingMode } from "@/lib/schemas/briefing";

export type { Briefing };

/** The composed daily briefing; omit `mode` to let the server pick by time of day. */
export function useBriefing(mode?: BriefingMode) {
  return useQuery({
    queryKey: queryKeys.briefing(mode ?? "auto"),
    queryFn: () =>
      getJSON<Briefing>(`/api/briefing${mode ? `?mode=${mode}` : ""}`),
  });
}
