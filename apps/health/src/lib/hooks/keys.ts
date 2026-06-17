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
  // Templates nest under one ["templates"] prefix so a single invalidate after any
  // mutation refreshes the list (both filters) and any open editor detail.
  templates: () => ["templates"] as const,
  templateList: (includeArchived: boolean) =>
    ["templates", "list", includeArchived] as const,
  template: (id: string) => ["templates", "detail", id] as const,
  exercises: () => ["exercises"] as const,
  connections: () => ["connections"] as const,
  syncStatus: () => ["sync-status"] as const,
  trends: (metric: string, days: number) => ["trends", metric, days] as const,
};
