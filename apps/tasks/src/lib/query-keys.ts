// Central query-key registry. Every task-list cache shares the ["tasks", ...]
// prefix so optimistic mutations can snapshot/patch/invalidate them as one
// family.

export const qk = {
  tasks: ["tasks"] as const,
  todayView: ["tasks", "today"] as const,
  upcoming: (days: number) => ["tasks", "upcoming", days] as const,
  projectPrefix: ["tasks", "project"] as const,
  project: (id: string, includeCompleted: boolean) =>
    ["tasks", "project", id, { includeCompleted }] as const,
  label: (id: string) => ["tasks", "label", id] as const,
  search: (q: string) => ["tasks", "search", q] as const,
  projectTree: ["projects", "tree"] as const,
  labels: ["labels"] as const,
};
