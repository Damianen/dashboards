// Next.js startup hook. When RUN_WORKER=1 (and only in the Node.js runtime, not
// Edge) it starts a once-a-minute cron that fires due reminders. The guard
// keeps `next dev` from double-firing notifications during local development —
// enable the worker explicitly in the process that should own it.

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.RUN_WORKER !== "1") return;

  const { schedule } = await import("node-cron");
  const { fireDueReminders } = await import("@/server/services/reminders");

  let running = false; // a slow tick must not overlap the next one
  schedule("* * * * *", () => {
    if (running) return;
    running = true;
    void fireDueReminders(new Date())
      .then((fired) => {
        if (fired > 0) console.log(`[worker] fired ${fired} reminder(s)`);
      })
      .catch((err) => console.error("[worker] reminder tick failed", err))
      .finally(() => {
        running = false;
      });
  });

  console.log("[worker] reminder cron started (every minute)");
}
