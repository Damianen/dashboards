"use client";

import * as React from "react";
import {
  CalendarClock,
  Flag,
  FolderTree,
  Hash,
  Inbox,
  Repeat,
  Tag,
} from "lucide-react";
import { usePathname } from "next/navigation";

import {
  Drawer,
  DrawerContent,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useCreateTaskFromText } from "@/hooks/use-task-mutations";
import { useLabels, useProjectTree } from "@/hooks/use-task-queries";
import { DEFAULT_TIMEZONE, formatDueChip } from "@/lib/dates";
import { priorityLabel, priorityTextClass } from "@/lib/priority";
import { parse, type ParseResult } from "@/lib/quickadd/parse";
import type { CreateTaskFromTextBase } from "@/server/services/tasks";
import { cn } from "@/lib/utils";

interface Destination {
  label: string;
  icon: "inbox" | "label";
  base: CreateTaskFromTextBase;
}

/** Where a quick-add lands by default, derived from the current route. */
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
      base: { projectId },
    };
  }
  const labelId = pathname.match(/^\/label\/([^/]+)/)?.[1];
  if (labelId) {
    const name = labels.data?.find((l) => l.id === labelId)?.name;
    return {
      label: name ?? "Label",
      icon: "label",
      base: { labelIds: [labelId] },
    };
  }
  return { label: "Inbox", icon: "inbox", base: {} };
}

function Chip({
  icon: Icon,
  children,
  isNew,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  isNew?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-[12rem] items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground",
        className,
      )}
    >
      <Icon className="size-3 shrink-0" />
      <span className="truncate">{children}</span>
      {isNew && (
        <span className="rounded-full bg-primary/15 px-1 text-[10px] font-semibold text-primary">
          new
        </span>
      )}
    </span>
  );
}

/** Live preview of what the parser extracted from the input, before submit. */
function ParseChips({ parsed }: { parsed: ParseResult }) {
  const projects = useProjectTree();
  const labels = useLabels();

  const projectIsNew =
    parsed.projectName !== undefined &&
    !projects.data?.some(
      (p) => p.name.toLowerCase() === parsed.projectName!.toLowerCase(),
    );
  const labelIsNew = (name: string) =>
    !labels.data?.some((l) => l.name.toLowerCase() === name.toLowerCase());

  const hasAny =
    parsed.dueAt !== undefined ||
    parsed.recurrenceRaw !== undefined ||
    parsed.priority !== undefined ||
    parsed.projectName !== undefined ||
    parsed.sectionName !== undefined ||
    parsed.labelNames.length > 0;
  if (!hasAny) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {parsed.recurrenceRaw !== undefined ? (
        <Chip icon={Repeat}>{parsed.recurrenceRaw}</Chip>
      ) : (
        parsed.dueAt !== undefined && (
          <Chip icon={CalendarClock}>
            {formatDueChip(parsed.dueAt, parsed.hasDueTime, DEFAULT_TIMEZONE)}
          </Chip>
        )
      )}
      {parsed.priority !== undefined && (
        <Chip icon={Flag} className={priorityTextClass(parsed.priority)}>
          {priorityLabel(parsed.priority)}
        </Chip>
      )}
      {parsed.projectName !== undefined && (
        <Chip icon={Hash} isNew={projectIsNew}>
          {parsed.projectName}
        </Chip>
      )}
      {parsed.sectionName !== undefined && (
        <Chip icon={FolderTree}>{parsed.sectionName}</Chip>
      )}
      {parsed.labelNames.map((name) => (
        <Chip key={name} icon={Tag} isNew={labelIsNew(name)}>
          {name}
        </Chip>
      ))}
    </div>
  );
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
  const create = useCreateTaskFromText();
  const destination = useDestination();

  // Preview only — the server re-parses authoritatively on submit, so we never
  // send the client's parsed dueAt (it could drift near midnight).
  const parsed = React.useMemo(
    () => parse(value, { timezone: DEFAULT_TIMEZONE }),
    [value],
  );

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
    if (parsed.content.trim().length === 0) return;
    setValue(""); // clear instantly; the sheet stays open for rapid entry
    create.mutate({ text: value, base: destination.base });
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
            placeholder="Add a task…  try: pay rent tomorrow 9am p2 #Finance @admin"
            enterKeyHint="done"
            aria-label="Task title"
            className="w-full bg-transparent text-base outline-none placeholder:text-muted-foreground"
          />
          <ParseChips parsed={parsed} />
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
              <Icon className="size-3.5" aria-hidden />
              {destination.label}
            </span>
            <button
              type="submit"
              disabled={parsed.content.trim().length === 0}
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
