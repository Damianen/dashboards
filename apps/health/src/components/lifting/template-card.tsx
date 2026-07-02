"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArchiveRestore,
  Clock,
  Copy,
  MoreVertical,
  Pencil,
  Play,
} from "lucide-react";

import { TemplatePreviewSheet } from "@/components/lifting/template-preview-sheet";
import {
  BottomSheet,
  BottomSheetAction,
} from "@/components/ui/bottom-sheet";
import { Card } from "@/components/ui/card";
import { todayLocal } from "@/lib/dates";
import { formatLastPerformed } from "@/lib/format";
import {
  type TemplateDTO,
  useArchiveTemplate,
  useDuplicateTemplate,
  useStartFromTemplate,
} from "@/lib/hooks/use-templates";

/**
 * A template card in the 2-column grid: name, a greyed comma-separated exercise
 * list, and a clock + "last performed" label. Tapping the card body opens the
 * preview sheet; the "…" button opens the action menu (start / edit / duplicate /
 * archive).
 */
export function TemplateCard({ template }: { template: TemplateDTO }) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const start = useStartFromTemplate();
  const duplicate = useDuplicateTemplate();
  const archive = useArchiveTemplate();

  const exerciseList = template.exercises
    .map((e) => e.exerciseName)
    .join(", ");

  function startWorkout() {
    setMenuOpen(false);
    start.mutate(template.id, {
      onSuccess: (session) =>
        router.push(`/lifting/sessions/${session.sessionId}`),
    });
  }
  function edit() {
    setMenuOpen(false);
    setPreviewOpen(false);
    router.push(`/lifting/templates/${template.id}/edit`);
  }
  function dup() {
    setMenuOpen(false);
    duplicate.mutate(template.id, {
      onSuccess: (created) =>
        router.push(`/lifting/templates/${created.id}/edit`),
    });
  }
  function toggleArchive() {
    setMenuOpen(false);
    archive.mutate({ id: template.id, archived: !template.archived });
  }

  return (
    <Card className="relative gap-0 overflow-hidden p-0">
      <button
        type="button"
        onClick={() => setPreviewOpen(true)}
        className="flex h-full w-full flex-col gap-1 p-3 text-left"
      >
        <p className="truncate pr-7 font-medium">{template.name}</p>
        <p className="text-muted-foreground line-clamp-2 min-h-[2.5rem] text-xs leading-relaxed">
          {exerciseList || "No exercises"}
        </p>
        <p className="text-muted-foreground mt-auto flex items-center gap-1 pt-1 text-xs tabular-nums">
          <Clock className="size-3.5 shrink-0" aria-hidden />
          {formatLastPerformed(template.lastPerformedDay, todayLocal())}
        </p>
      </button>

      <BottomSheet
        open={menuOpen}
        onOpenChange={setMenuOpen}
        variant="menu"
        title={template.name}
        description="Choose an action for this template."
        showTitle
        titleClassName="px-3 pb-1 font-semibold"
        bodyClassName="space-y-1"
        trigger={
          <button
            type="button"
            aria-label={`Actions for ${template.name}`}
            className="hover:bg-accent absolute top-1 right-1 flex size-9 items-center justify-center rounded-md transition-colors"
          >
            <MoreVertical className="size-5" aria-hidden />
          </button>
        }
      >
        {!template.archived && (
          <BottomSheetAction
            icon={<Play className="size-5" aria-hidden />}
            label="Start workout"
            onClick={startWorkout}
          />
        )}
        <BottomSheetAction
          icon={<Pencil className="size-5" aria-hidden />}
          label="Edit"
          onClick={edit}
        />
        <BottomSheetAction
          icon={<Copy className="size-5" aria-hidden />}
          label="Duplicate"
          onClick={dup}
        />
        {template.archived ? (
          <BottomSheetAction
            icon={<ArchiveRestore className="size-5" aria-hidden />}
            label="Unarchive"
            onClick={toggleArchive}
          />
        ) : (
          <BottomSheetAction
            icon={<Archive className="size-5" aria-hidden />}
            label="Archive"
            onClick={toggleArchive}
            destructive
          />
        )}
      </BottomSheet>

      <TemplatePreviewSheet
        template={template}
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        onEdit={edit}
      />
    </Card>
  );
}
