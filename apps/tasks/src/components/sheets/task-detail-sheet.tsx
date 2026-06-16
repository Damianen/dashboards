"use client";

import {
  ChevronRight,
  Flag,
  Folder,
  Inbox,
  Repeat,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import * as React from "react";

import { LabelChips } from "@/components/tasks/label-chips";
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  useDeleteTask,
  useMoveTask,
  useUpdateTask,
} from "@/hooks/use-task-mutations";
import { useLabels, useProjectTree } from "@/hooks/use-task-queries";
import { wallClockParts } from "@/lib/dates";
import { PRIORITIES, priorityTextClass } from "@/lib/priority";
import { describeRRule } from "@/lib/recurrence";
import { cn } from "@/lib/utils";
import type { Label } from "@/generated/prisma/client";
import type { TaskWithLabels } from "@/server/services/tasks";

import { DueDateField } from "./due-date-field";
import { LabelPicker } from "./label-picker";
import { RemindersField } from "./reminders-field";
import {
  ProjectSectionPicker,
  type MoveDestination,
} from "./project-section-picker";

/**
 * Bottom-sheet task editor. No Save button — every field auto-commits
 * (title/description on blur, everything else on change), all optimistic.
 * Every field is locally controlled so the sheet reflects its own edits
 * instantly, while the mutation propagates to the lists behind it.
 */
export function TaskDetailSheet({
  task,
  open,
  onOpenChange,
}: {
  task: TaskWithLabels | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Drawer open={open && task !== null} onOpenChange={onOpenChange}>
      {task && (
        <DetailContent
          key={task.id}
          task={task}
          onClose={() => onOpenChange(false)}
        />
      )}
    </Drawer>
  );
}

function DetailContent({
  task,
  onClose,
}: {
  task: TaskWithLabels;
  onClose: () => void;
}) {
  const update = useUpdateTask();
  const move = useMoveTask();
  const remove = useDeleteTask();

  const [title, setTitle] = React.useState(task.title);
  const [description, setDescription] = React.useState(task.description ?? "");
  const [priority, setPriority] = React.useState(task.priority);
  const [due, setDue] = React.useState({
    dueAt: task.dueAt,
    hasDueTime: task.hasDueTime,
  });
  const [labelIds, setLabelIds] = React.useState(task.labels.map((l) => l.id));
  const [rrule, setRrule] = React.useState(task.rrule);
  const [location, setLocation] = React.useState<MoveDestination>({
    projectId: task.projectId,
    sectionId: task.sectionId,
  });
  const [confirmingDelete, setConfirmingDelete] = React.useState(false);

  const tree = useProjectTree();
  const labelsQuery = useLabels();
  const labelsById = React.useMemo(
    () => new Map((labelsQuery.data ?? task.labels).map((l) => [l.id, l])),
    [labelsQuery.data, task.labels],
  );
  const selectedLabels = labelIds
    .map((id) => labelsById.get(id))
    .filter((l): l is Label => l !== undefined);

  const project = tree.data?.find((p) => p.id === location.projectId);
  const section = project?.sections.find((s) => s.id === location.sectionId);
  const locationLabel = section
    ? `${project?.name} · ${section.name}`
    : (project?.name ?? "Inbox");

  function commitTitle() {
    const next = title.trim();
    if (next.length === 0) {
      setTitle(task.title);
      return;
    }
    if (next !== task.title) {
      update.mutate({ id: task.id, edit: { title: next } });
    }
  }

  function commitDescription() {
    const next = description.trim();
    if (next !== (task.description ?? "")) {
      update.mutate({
        id: task.id,
        edit: { description: next.length > 0 ? next : null },
      });
    }
  }

  function changePriority(next: number) {
    setPriority(next);
    update.mutate({ id: task.id, edit: { priority: next } });
  }

  function changeDue(next: { dueAt: Date | null; hasDueTime: boolean }) {
    setDue(next);
    update.mutate({
      id: task.id,
      edit: { ...next, timezone: task.timezone },
    });
  }

  function changeLabels(ids: string[]) {
    setLabelIds(ids);
    update.mutate({ id: task.id, edit: { labelIds: ids } });
  }

  function clearRecurrence() {
    setRrule(null);
    update.mutate({
      id: task.id,
      edit: { rrule: null, recursFromCompletion: false },
    });
  }

  const recurrenceTime =
    due.hasDueTime && due.dueAt
      ? {
          hour: wallClockParts(due.dueAt, task.timezone).hour,
          minute: wallClockParts(due.dueAt, task.timezone).minute,
        }
      : null;

  function changeLocation(dest: MoveDestination) {
    setLocation(dest);
    move.mutate({
      id: task.id,
      input:
        dest.sectionId === null
          ? { projectId: dest.projectId, sectionId: null, parentId: null }
          : { projectId: dest.projectId, sectionId: dest.sectionId },
    });
  }

  return (
    <DrawerContent className="max-h-[92dvh]">
      <DrawerTitle className="sr-only">Task details</DrawerTitle>
      <div className="flex flex-col overflow-y-auto px-4 pt-2 pb-6">
        <AutoTextarea
          value={title}
          onValueChange={setTitle}
          onBlur={commitTitle}
          ariaLabel="Title"
          placeholder="Task title"
          className="text-base font-medium"
        />
        <AutoTextarea
          value={description}
          onValueChange={setDescription}
          onBlur={commitDescription}
          ariaLabel="Description"
          placeholder="Add a description…"
          className="text-base text-muted-foreground"
        />

        <div className="py-3">
          <PriorityPicker value={priority} onChange={changePriority} />
        </div>

        <Divider />
        <DueDateField
          dueAt={due.dueAt}
          hasDueTime={due.hasDueTime}
          timezone={task.timezone}
          onChange={changeDue}
        />

        {rrule !== null && (
          <div className={ROW_CLASS}>
            <Repeat
              className="size-5 shrink-0 text-muted-foreground"
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate text-left text-sm">
              {describeRRule(rrule, recurrenceTime)}
            </span>
            <button
              type="button"
              aria-label="Remove repeat"
              onClick={clearRecurrence}
              className="grid size-8 place-items-center rounded-md text-muted-foreground active:bg-muted"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        )}

        <Divider />
        <RemindersField taskId={task.id} timezone={task.timezone} />

        <Divider />
        <ProjectSectionPicker
          projectId={location.projectId}
          sectionId={location.sectionId}
          onSelect={changeLocation}
        >
          <button type="button" className={ROW_CLASS}>
            {project?.isInbox ? (
              <Inbox className="size-5 shrink-0 text-muted-foreground" aria-hidden />
            ) : (
              <Folder className="size-5 shrink-0 text-muted-foreground" aria-hidden />
            )}
            <span className="min-w-0 flex-1 truncate text-left text-sm">
              {locationLabel}
            </span>
            <ChevronRight
              className="size-4 shrink-0 text-muted-foreground/60"
              aria-hidden
            />
          </button>
        </ProjectSectionPicker>

        <Divider />
        <LabelPicker value={labelIds} onChange={changeLabels}>
          <button type="button" className={ROW_CLASS}>
            <Tag className="size-5 shrink-0 text-muted-foreground" aria-hidden />
            {selectedLabels.length > 0 ? (
              <LabelChips labels={selectedLabels} className="min-w-0 flex-1" />
            ) : (
              <span className="flex-1 text-left text-sm text-muted-foreground">
                Add labels
              </span>
            )}
            <ChevronRight
              className="size-4 shrink-0 text-muted-foreground/60"
              aria-hidden
            />
          </button>
        </LabelPicker>

        <Divider />
        <button
          type="button"
          onClick={() => {
            if (!confirmingDelete) {
              setConfirmingDelete(true);
              return;
            }
            remove.mutate(task.id);
            onClose();
          }}
          onBlur={() => setConfirmingDelete(false)}
          className={cn(
            "mt-2 inline-flex h-11 items-center justify-center gap-2 rounded-lg text-sm font-medium transition",
            confirmingDelete
              ? "bg-destructive text-white"
              : "bg-destructive/10 text-destructive",
          )}
        >
          <Trash2 className="size-4" aria-hidden />
          {confirmingDelete ? "Tap again to delete" : "Delete task"}
        </button>
      </div>
    </DrawerContent>
  );
}

const ROW_CLASS =
  "-mx-1 flex min-h-11 w-full items-center gap-2 rounded-lg px-1 active:bg-muted";

function Divider() {
  return <div className="my-1 h-px bg-border" />;
}

function AutoTextarea({
  value,
  onValueChange,
  onBlur,
  ariaLabel,
  placeholder,
  className,
}: {
  value: string;
  onValueChange: (value: string) => void;
  onBlur: () => void;
  ariaLabel: string;
  placeholder: string;
  className?: string;
}) {
  const ref = React.useRef<HTMLTextAreaElement>(null);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      value={value}
      rows={1}
      aria-label={ariaLabel}
      placeholder={placeholder}
      onChange={(e) => onValueChange(e.target.value)}
      onBlur={onBlur}
      className={cn(
        "w-full resize-none bg-transparent py-1 outline-none placeholder:text-muted-foreground/60",
        className,
      )}
    />
  );
}

function PriorityPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (priority: number) => void;
}) {
  return (
    <div className="grid grid-cols-4 gap-2" role="group" aria-label="Priority">
      {PRIORITIES.map((priority) => {
        const active = priority === value;
        return (
          <button
            key={priority}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(priority)}
            className={cn(
              "flex h-11 items-center justify-center gap-1.5 rounded-lg border text-sm font-medium transition",
              active ? "border-current bg-muted" : "border-border",
              priorityTextClass(priority),
            )}
          >
            <Flag
              className="size-4"
              fill={priority < 4 ? "currentColor" : "none"}
              aria-hidden
            />
            <span className={active ? "" : "text-foreground"}>P{priority}</span>
          </button>
        );
      })}
    </div>
  );
}
