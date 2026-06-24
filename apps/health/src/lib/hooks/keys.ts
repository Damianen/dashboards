// Central query-key factory so the dashboard reads and the quick-log mutations
// invalidate exactly the same keys.
export const queryKeys = {
  summary: (day: string) => ["summary", day] as const,
  water: (day: string) => ["water", day] as const,
  food: (day: string) => ["food", day] as const,
  // Supplements nest under one ["supplements"] prefix so a single invalidate after
  // any list mutation refreshes the manage list (both filters); the per-day
  // checklist is keyed on its own day.
  supplements: () => ["supplements"] as const,
  supplementChecklist: (day: string) =>
    ["supplements", "checklist", day] as const,
  supplementList: (includeArchived: boolean) =>
    ["supplements", "list", includeArchived] as const,
  // Lifting reads nest under one ["lifting"] prefix so a single invalidate after
  // logging a set refreshes both the sessions list and any exercise history.
  lifting: () => ["lifting"] as const,
  liftingSessions: (day?: string) =>
    ["lifting", "sessions", day ?? "recent"] as const,
  liftingHistory: (exercise: string, limit: number) =>
    ["lifting", "history", exercise, limit] as const,
  // One session's full detail (plan + sets + progress), keyed on its own id so the
  // session view refetches after each set without disturbing the sessions list.
  session: (id: string) => ["session", id] as const,
  // Templates nest under one ["templates"] prefix so a single invalidate after any
  // mutation refreshes the list (both filters) and any open editor detail.
  templates: () => ["templates"] as const,
  templateList: (includeArchived: boolean) =>
    ["templates", "list", includeArchived] as const,
  template: (id: string) => ["templates", "detail", id] as const,
  exercises: () => ["exercises"] as const,
  // Meals (recipes) nest under one ["meals"] prefix so a single invalidate after any
  // mutation refreshes the list (both filters) and any open builder detail.
  meals: () => ["meals"] as const,
  mealList: (includeArchived: boolean) =>
    ["meals", "list", includeArchived] as const,
  meal: (id: string) => ["meals", "detail", id] as const,
  connections: () => ["connections"] as const,
  syncStatus: () => ["sync-status"] as const,
  trends: (metric: string, days: number) => ["trends", metric, days] as const,
  observations: (window: number) => ["observations", window] as const,
};
