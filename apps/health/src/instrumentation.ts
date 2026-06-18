// Next runs this once at server startup (Node and Edge runtimes both). We only start
// the in-process croner scheduler in the Node runtime, and only when explicitly enabled
// — default off so local dev stays quiet. The scheduler is imported dynamically so croner
// never reaches the Edge bundle.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.ENABLE_SCHEDULER !== "true") return;

  const { startScheduler } = await import("@/server/scheduler");
  startScheduler();
}
