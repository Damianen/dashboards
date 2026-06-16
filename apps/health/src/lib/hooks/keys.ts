// Central query-key factory so the dashboard reads and the quick-log mutations
// invalidate exactly the same keys.
export const queryKeys = {
  summary: (day: string) => ["summary", day] as const,
  water: (day: string) => ["water", day] as const,
  supplementNames: () => ["supplement-names"] as const,
};
