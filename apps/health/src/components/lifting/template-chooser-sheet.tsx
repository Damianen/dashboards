"use client";

import { useRouter } from "next/navigation";
import { Drawer } from "vaul";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useStartFromTemplate, useTemplates } from "@/lib/hooks/use-templates";
import { templateSummary } from "@/lib/template-summary";

/**
 * "Start from template" chooser: lists the active templates and, on tap, starts a
 * session from that template and navigates to its session view. The empty ad-hoc
 * path (the "Add set" sheet) stays separate on /lifting.
 */
export function TemplateChooserSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { data, isLoading, isError, refetch, isFetching } = useTemplates(false);
  const start = useStartFromTemplate();
  const templates = data ?? [];

  function choose(id: string) {
    start.mutate(id, {
      onSuccess: (session) => {
        onOpenChange(false);
        router.push(`/lifting/sessions/${session.sessionId}`);
      },
    });
  }

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <Drawer.Content
          className="bg-card fixed inset-x-0 bottom-0 z-50 mt-24 flex max-h-[90dvh] flex-col rounded-t-2xl border-t outline-none"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <div className="bg-muted mx-auto mt-3 h-1.5 w-10 shrink-0 rounded-full" />
          <div className="mx-auto w-full max-w-md space-y-3 p-4">
            <Drawer.Title className="text-base font-semibold">
              Start from template
            </Drawer.Title>
            <Drawer.Description className="sr-only">
              Pick a template to start a workout.
            </Drawer.Description>

            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-xl" />
                ))}
              </div>
            ) : isError ? (
              <div className="space-y-3 py-6 text-center">
                <p className="text-muted-foreground text-sm">
                  Couldn&apos;t load templates.
                </p>
                <Button
                  variant="outline"
                  onClick={() => void refetch()}
                  disabled={isFetching}
                >
                  Retry
                </Button>
              </div>
            ) : templates.length === 0 ? (
              <p className="text-muted-foreground py-6 text-center text-sm">
                No active templates yet.
              </p>
            ) : (
              <div className="max-h-[60dvh] space-y-2 overflow-y-auto">
                {templates.map((t) => {
                  const summary = templateSummary(t.exercises);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => choose(t.id)}
                      disabled={start.isPending}
                      className="hover:bg-accent flex min-h-14 w-full flex-col items-start justify-center gap-0.5 rounded-lg border px-4 py-2 text-left transition-colors disabled:opacity-60"
                    >
                      <span className="font-medium">{t.name}</span>
                      {summary && (
                        <span className="text-muted-foreground truncate text-sm">
                          {summary}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
