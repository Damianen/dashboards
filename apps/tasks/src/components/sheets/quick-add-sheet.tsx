"use client";

import * as React from "react";
import { Inbox, Tag } from "lucide-react";
import { usePathname } from "next/navigation";

import {
  Drawer,
  DrawerContent,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useCreateTask } from "@/hooks/use-task-mutations";
import { useLabels, useProjectTree } from "@/hooks/use-task-queries";
import type { TaskCreateInput } from "@/lib/schemas";

interface Destination {
  label: string;
  icon: "inbox" | "label";
  create: Pick<TaskCreateInput, "projectId" | "labelIds">;
}

/** Where a quick-add lands, derived from the current route (decision #8). */
function useDestination(): Destination {
  const pathname = usePathname();
  const projects = useProjectTree();
  const labels = useLabels();

  const projectId = pathname.match(/^\/project\/([^/]+)/)?.[1];
  if (projectId) {
    const name = projects.data?.find((p) => p.id === projectId)?.name;
    return {
      label: name ?? "Project",
      icon: name === "Inbox" ? "inbox" : "label",
      create: { projectId },
    };
  }
  const labelId = pathname.match(/^\/label\/([^/]+)/)?.[1];
  if (labelId) {
    const name = labels.data?.find((l) => l.id === labelId)?.name;
    return {
      label: name ?? "Label",
      icon: "label",
      create: { labelIds: [labelId] },
    };
  }
  return { label: "Inbox", icon: "inbox", create: {} };
}

export function QuickAddSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [value, setValue] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);
  const create = useCreateTask();
  const destination = useDestination();

  // Autofocus when the sheet opens (vaul mounts content lazily).
  React.useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => inputRef.current?.focus(), 80);
    return () => window.clearTimeout(id);
  }, [open]);

  function handleOpenChange(next: boolean) {
    if (!next) setValue("");
    onOpenChange(next);
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const title = value.trim();
    if (title.length === 0) return;
    setValue(""); // clear instantly; the sheet stays open for rapid entry
    create.mutate({ title, ...destination.create });
    inputRef.current?.focus();
  }

  const Icon = destination.icon === "inbox" ? Inbox : Tag;

  return (
    <Drawer open={open} onOpenChange={handleOpenChange} repositionInputs>
      <DrawerContent showHandle={false} className="pb-0">
        <DrawerTitle className="sr-only">Add task</DrawerTitle>
        <form onSubmit={submit} className="flex flex-col gap-3 px-4 pt-4 pb-4">
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Add a task…"
            enterKeyHint="done"
            aria-label="Task title"
            className="w-full bg-transparent text-base outline-none placeholder:text-muted-foreground"
          />
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
              <Icon className="size-3.5" aria-hidden />
              {destination.label}
            </span>
            <button
              type="submit"
              disabled={value.trim().length === 0}
              className="inline-flex h-11 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition active:scale-95 disabled:opacity-40"
            >
              Add
            </button>
          </div>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
