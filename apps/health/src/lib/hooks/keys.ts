// Central query-key factory so the dashboard reads and the quick-log mutations
// invalidate exactly the same keys.
export const queryKeys = {
  summary: (day: string) => ["summary", day] as const,
  water: (day: string) => ["water", day] as const,
  food: (day: string) => ["food", day] as const,
  supplementNames: () => ["supplement-names"] as const,
  // Lifting reads nest under one ["lifting"] prefix so a single invalidate after
  // logging a set refreshes both the sessions list and any exercise history.
  lifting: () => ["lifting"] as const,
  liftingSessions: (day?: string) =>
    ["lifting", "sessions", day ?? "recent"] as const,
  liftingHistory: (exercise: string, limit: number) =>
    ["lifting", "history", exercise, limit] as const,
  exercises: () => ["exercises"] as const,
};
