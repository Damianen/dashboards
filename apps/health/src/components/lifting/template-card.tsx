"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArchiveRestore,
  Copy,
  MoreVertical,
  Pencil,
  Play,
} from "lucide-react";
import { Drawer } from "vaul";

import { Card, CardContent } from "@/components/ui/card";
import {
  type TemplateDTO,
  useArchiveTemplate,
  useDuplicateTemplate,
  useStartFromTemplate,
} from "@/lib/hooks/use-templates";
import { templateSummary } from "@/lib/template-summary";

function ActionItem({
  icon,
  label,
  onClick,
  destructive,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`hover:bg-accent flex min-h-12 w-full items-center gap-3 rounded-md px-3 text-left text-base font-medium transition-colors ${
        destructive ? "text-destructive" : ""
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

export function TemplateCard({ template }: { template: TemplateDTO }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const start = useStartFromTemplate();
  const duplicate = useDuplicateTemplate();
  const archive = useArchiveTemplate();

  const count = template.exercises.length;
  const summary = templateSummary(template.exercises);

  function startWorkout() {
    setOpen(false);
    start.mutate(template.id, {
      onSuccess: () => router.push("/lifting"),
    });
  }
  function edit() {
    setOpen(false);
    router.push(`/lifting/templates/${template.id}/edit`);
  }
  function dup() {
    setOpen(false);
    duplicate.mutate(template.id, {
      onSuccess: (created) =>
        router.push(`/lifting/templates/${created.id}/edit`),
    });
  }
  function toggleArchive() {
    setOpen(false);
    archive.mutate({ id: template.id, archived: !template.archived });
  }

  return (
    <Card className="gap-0 py-0">
      <CardContent className="flex items-start justify-between gap-2 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{template.name}</p>
          <p className="text-muted-foreground text-sm">
            {count} {count === 1 ? "exercise" : "exercises"}
          </p>
          {summary && (
            <p className="text-muted-foreground mt-0.5 truncate text-sm">
              {summary}
            </p>
          )}
        </div>

        <Drawer.Root open={open} onOpenChange={setOpen}>
          <Drawer.Trigger asChild>
            <button
              type="button"
              aria-label={`Actions for ${template.name}`}
              className="hover:bg-accent -mr-1 flex size-11 shrink-0 items-center justify-center rounded-md transition-colors"
            >
              <MoreVertical className="size-5" aria-hidden />
            </button>
          </Drawer.Trigger>
          <Drawer.Portal>
            <Drawer.Overlay className="fixed inset-0 z-50 bg-black/60" />
            <Drawer.Content
              className="bg-card fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-2xl border-t outline-none"
              style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
            >
              <div className="bg-muted mx-auto mt-3 h-1.5 w-10 shrink-0 rounded-full" />
              <div className="mx-auto w-full max-w-md space-y-1 p-4">
                <Drawer.Title className="px-3 pb-1 font-semibold">
                  {template.name}
                </Drawer.Title>
                <Drawer.Description className="sr-only">
                  Choose an action for this template.
                </Drawer.Description>

                {!template.archived && (
                  <ActionItem
                    icon={<Play className="size-5" aria-hidden />}
                    label="Start workout"
                    onClick={startWorkout}
                  />
                )}
                <ActionItem
                  icon={<Pencil className="size-5" aria-hidden />}
                  label="Edit"
                  onClick={edit}
                />
                <ActionItem
                  icon={<Copy className="size-5" aria-hidden />}
                  label="Duplicate"
                  onClick={dup}
                />
                {template.archived ? (
                  <ActionItem
                    icon={<ArchiveRestore className="size-5" aria-hidden />}
                    label="Unarchive"
                    onClick={toggleArchive}
                  />
                ) : (
                  <ActionItem
                    icon={<Archive className="size-5" aria-hidden />}
                    label="Archive"
                    onClick={toggleArchive}
                    destructive
                  />
                )}
              </div>
            </Drawer.Content>
          </Drawer.Portal>
        </Drawer.Root>
      </CardContent>
    </Card>
  );
}
