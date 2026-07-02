"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { getJSON } from "@/lib/fetcher";
import { queryKeys } from "@/lib/hooks/keys";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import type { OffSearchResult } from "@/server/services/off";

export type { OffSearchResult };

/**
 * Debounced Open Food Facts product search. The query is debounced ~300 ms and
 * the request is skipped until there's at least 2 trimmed characters, so typing
 * doesn't hammer OFF (and our route's rate budget). Previous results are kept
 * while the next query is in flight so the list never blanks per keystroke.
 */
export function useFoodSearch(query: string) {
  const debounced = useDebouncedValue(query.trim(), 300);
  return useQuery({
    queryKey: queryKeys.foodSearch(debounced),
    queryFn: () =>
      getJSON<OffSearchResult[]>(
        `/api/food/search?q=${encodeURIComponent(debounced)}`,
      ),
    enabled: debounced.length >= 2,
    placeholderData: keepPreviousData,
  });
}
