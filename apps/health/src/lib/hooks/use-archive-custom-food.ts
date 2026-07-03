"use client";

import { postJSON } from "@/lib/fetcher";
import type { CustomFoodDTO } from "@/lib/food";
import { queryKeys } from "@/lib/hooks/keys";
import { useArchiveToggle } from "@/lib/hooks/use-archive-toggle";

/**
 * Archive (retire) a saved custom food, or restore it ({ archived: false }):
 * cached My Foods lists flip optimistically, then the ["custom-foods"] prefix
 * refresh converges. Archiving hides it from the active list and from MCP name
 * resolution; past diary entries are untouched. `archived` defaults to true.
 */
export function useArchiveCustomFood() {
  const toggle = useArchiveToggle<CustomFoodDTO>({
    prefix: queryKeys.customFoods(),
    request: ({ id, archived }) =>
      postJSON(`/api/food/custom/${id}/archive`, { archived }),
    errorMessage: "Couldn't update the food",
    successMessage: (archived) => (archived ? "Food archived" : "Food restored"),
    // An archived food must drop out of the re-log strip immediately (the
    // recents read path excludes archived foods; the cache must follow).
    alsoInvalidate: [queryKeys.foodRecentPrefix()],
  });
  return {
    ...toggle,
    mutate: (
      { id, archived = true }: { id: string; archived?: boolean },
      options?: Parameters<typeof toggle.mutate>[1],
    ) => toggle.mutate({ id, archived }, options),
  };
}
