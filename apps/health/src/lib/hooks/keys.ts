import type { QueryClient } from "@tanstack/react-query";

// Central query-key factory so the dashboard reads and the quick-log mutations
// invalidate exactly the same keys.
export const queryKeys = {
  summary: (day: string) => ["summary", day] as const,
  // Every cached day at once — for mutations that shift a target formula input
  // (water base target) rather than one day's logs.
  summaryPrefix: () => ["summary"] as const,
  water: (day: string) => ["water", day] as const,
  waterPrefix: () => ["water"] as const,
  food: (day: string) => ["food", day] as const,
  // OFF product search results, debounced per query string. Lives under the
  // ["food"] namespace but never collides with ["food", <day>] — the second
  // element is the literal "search", never a date.
  foodSearch: (q: string) => ["food", "search", q] as const,
  // Recently-logged distinct foods (the 2-tap re-log strip). Same namespace
  // trick: "recent" is never a date.
  foodRecent: (limit: number) => ["food", "recent", limit] as const,
  foodRecentPrefix: () => ["food", "recent"] as const,
  // Saved custom foods nest under one ["custom-foods"] prefix so a single invalidate
  // after any create/edit/archive refreshes the My Foods list (every q/filter) AND the
  // meal builder's "Saved" picker.
  customFoods: () => ["custom-foods"] as const,
  customFoodList: (q: string, includeArchived: boolean) =>
    ["custom-foods", "list", q, includeArchived] as const,
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
  e1rm: (exercise: string, days: number) =>
    ["lifting", "e1rm", exercise, days] as const,
  muscleVolume: (weeks: number) =>
    ["lifting", "muscle-volume", weeks] as const,
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
  // Daily plans nest under one ["daily-plans"] prefix so a single invalidate after any
  // mutation refreshes the list (both filters) and any open builder detail.
  dailyPlans: () => ["daily-plans"] as const,
  dailyPlanList: (includeArchived: boolean) =>
    ["daily-plans", "list", includeArchived] as const,
  dailyPlan: (id: string) => ["daily-plans", "detail", id] as const,
  connections: () => ["connections"] as const,
  syncStatus: () => ["sync-status"] as const,
  trends: (metric: string, days: number) => ["trends", metric, days] as const,
  workouts: (days: number) => ["workouts", days] as const,
  observations: (window: number) => ["observations", window] as const,
  // Past notified observations. Same namespace trick as foodSearch: the second
  // element is the literal "history", never a window number — and the
  // ["observations"] sync-invalidation prefix harmlessly covers it.
  observationHistory: (limit: number) =>
    ["observations", "history", limit] as const,
  adherence: (day: string) => ["adherence", day] as const,
  // Every day's adherence at once — for mutations that shift the targets
  // themselves (protein g/kg, calorie target) rather than one day's logs.
  adherencePrefix: () => ["adherence"] as const,
  tdee: (window: number) => ["tdee", window] as const,
  // Every cached TDEE window at once — saving a new default window must also
  // refresh tdee(0), the "server default" query.
  tdeePrefix: () => ["tdee"] as const,
  recovery: (day: string, window: number) =>
    ["recovery", day, window] as const,
  // The weekly review, keyed by its (Monday) week start; undefined = the
  // current week resolved server-side, cached separately so it refreshes as
  // the week advances past midnight without a stale Monday key.
  weeklyReview: (weekStart?: string) =>
    ["weekly-review", weekStart ?? "current"] as const,
  weightGoal: () => ["weight-goal"] as const,
  // The goal-target feature under one ["goal"] prefix: the status read and the
  // create form's live plan preview (keyed by its raw inputs, foodSearch-style).
  // One prefix so decisions/creates and landed syncs refresh both at once.
  goal: () => ["goal"] as const,
  goalStatus: () => ["goal", "status"] as const,
  goalPreview: (goalWeightKg: string, targetDate: string) =>
    ["goal", "preview", goalWeightKg, targetDate] as const,
  // The composed daily briefing, keyed by requested mode ("auto" = resolve by
  // time of day server-side). One prefix so settings saves refresh every mode.
  briefing: (mode: string) => ["briefing", mode] as const,
  briefingPrefix: () => ["briefing"] as const,
  rotation: () => ["rotation"] as const,
  // One editable settings endpoint (the Settings-page cards), keyed by its
  // name — e.g. setting("protein") caches GET /api/settings/protein.
  setting: (name: string) => ["settings", name] as const,
};

/**
 * Every read that can change when a wearable sync lands new data — weight moves
 * the summary, trends, protein target (adherence), goal ETA and TDEE; sleep/
 * readiness/activity move the summary, trends, recovery and observations. One
 * list so "sync Oura", "sync Withings" and "sync all" refresh the same caches.
 */
export const SYNC_AFFECTED_PREFIXES: readonly (readonly string[])[] = [
  ["summary"],
  ["trends"],
  ["workouts"],
  ["adherence"],
  ["recovery"],
  ["tdee"],
  ["weight-goal"],
  // A landed weigh-in moves the goal's trend, progress and paused state.
  ["goal"],
  ["observations"],
  // The briefing composes sleep/readiness/recovery/weight — all sync-movable.
  ["briefing"],
  // The weekly review aggregates the summary view — every domain a sync can move.
  ["weekly-review"],
];

/** Invalidate everything a landed sync may have changed (see SYNC_AFFECTED_PREFIXES). */
export function invalidateAfterSync(qc: QueryClient): void {
  for (const prefix of SYNC_AFFECTED_PREFIXES) {
    void qc.invalidateQueries({ queryKey: prefix });
  }
}
