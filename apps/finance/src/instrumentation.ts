// Next runs register() once on server startup. We use it to schedule the
// unattended bank sync with node-cron, inside the app process (apps/tasks has
// no scheduler, so this is the prompt's node-cron fallback).

export async function register(): Promise<void> {
  // Only the Node.js server runtime — not Edge, not the build step.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Guard against double-registration across dev hot reloads.
  const g = globalThis as unknown as { __financeSyncCron?: boolean };
  if (g.__financeSyncCron) return;
  g.__financeSyncCron = true;

  const { schedule } = await import("node-cron");
  const { syncAll } = await import("@/server/services/sync");

  // Every 6 hours. PSD2 allows ~4 unattended fetches/account/day; the
  // user-present "Sync now" is exempt. syncAll() is a no-op until a bank is
  // connected and EB is configured, so this is safe to always register.
  schedule(
    "0 */6 * * *",
    () => {
      void syncAll().catch((err: unknown) => {
        console.error(
          "[sync] scheduled run failed:",
          err instanceof Error ? err.name : err,
        );
      });
    },
    { timezone: "Europe/Amsterdam" },
  );
  console.info("[sync] scheduled every 6h (Europe/Amsterdam)");
}
