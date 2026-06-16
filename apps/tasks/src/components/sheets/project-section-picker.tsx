"use client";

import { Check, Hash, Inbox } from "lucide-react";
import * as React from "react";

import {
  DrawerContent,
  DrawerNested,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { useProjectTree } from "@/hooks/use-task-queries";
import { cn } from "@/lib/utils";

export interface MoveDestination {
  projectId: string;
  sectionId: string | null;
}

/** Controlled project/section chooser; reports the picked destination. */
export function ProjectSectionPicker({
  projectId,
  sectionId,
  onSelect,
  children,
}: {
  projectId: string;
  sectionId: string | null;
  onSelect: (dest: MoveDestination) => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const tree = useProjectTree();
  const projects = tree.data ?? [];

  function pick(dest: MoveDestination) {
    onSelect(dest);
    setOpen(false);
  }

  return (
    <DrawerNested open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>{children}</DrawerTrigger>
      <DrawerContent className="max-h-[80dvh]">
        <DrawerTitle className="px-4 pt-3 pb-1 text-sm font-semibold text-muted-foreground">
          Move to
        </DrawerTitle>
        <ul className="overflow-y-auto px-2 pb-4">
          {projects.map((project) => (
            <li key={project.id}>
              <PickerRow
                selected={projectId === project.id && sectionId === null}
                onClick={() =>
                  pick({ projectId: project.id, sectionId: null })
                }
              >
                {project.isInbox ? (
                  <Inbox className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                ) : (
                  <Hash className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                )}
                {project.name}
              </PickerRow>
              {project.sections.map((section) => (
                <PickerRow
                  key={section.id}
                  indent
                  selected={sectionId === section.id}
                  onClick={() =>
                    pick({ projectId: project.id, sectionId: section.id })
                  }
                >
                  {section.name}
                </PickerRow>
              ))}
            </li>
          ))}
        </ul>
      </DrawerContent>
    </DrawerNested>
  );
}

function PickerRow({
  selected,
  indent,
  onClick,
  children,
}: {
  selected: boolean;
  indent?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={selected}
      className={cn(
        "flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm active:bg-muted",
        indent && "pl-9",
        selected && "font-medium",
      )}
    >
      <span className="flex min-w-0 flex-1 items-center gap-2 truncate">
        {children}
      </span>
      {selected && <Check className="size-4 shrink-0 text-primary" aria-hidden />}
    </button>
  );
}
