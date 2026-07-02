"use client";

import { useState } from "react";
import { EllipsisVertical, RotateCcw, Trash2 } from "lucide-react";

import {
  BottomSheet,
  BottomSheetAction,
} from "@/components/ui/bottom-sheet";
import { ConfirmSheet } from "@/components/ui/confirm-sheet";
import { useDeleteSession } from "@/lib/hooks/use-delete-session";
import { useFinishSession } from "@/lib/hooks/use-finish-session";
import type { SessionDetailDTO } from "@/lib/hooks/use-session";

/**
 * Overflow menu for the session view: reopen a finished session (the
 * after-the-toast recovery path) and delete a junk session behind a
 * destructive two-step confirm (the delete cascades to its sets and plan
 * snapshot — the one action here that can't be undone).
 */
export function SessionMenu({ session }: { session: SessionDetailDTO }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { unfinish } = useFinishSession(session.sessionId, session.day);
  const del = useDeleteSession(session.sessionId, session.day);

  return (
    <>
      <BottomSheet
        open={menuOpen}
        onOpenChange={setMenuOpen}
        variant="menu"
        title="Session options"
        description="Reopen or delete this session."
        bodyClassName="space-y-1"
        trigger={
          <button
            type="button"
            aria-label="Session options"
            className="hover:bg-accent flex size-9 items-center justify-center rounded-md transition-colors"
          >
            <EllipsisVertical className="size-5" aria-hidden />
          </button>
        }
      >
        {session.endedAt != null && (
          <BottomSheetAction
            icon={<RotateCcw className="size-4" aria-hidden />}
            label="Reopen session"
            onClick={() => {
              setMenuOpen(false);
              unfinish.mutate();
            }}
          />
        )}
        <BottomSheetAction
          icon={<Trash2 className="size-4" aria-hidden />}
          label="Delete session"
          destructive
          onClick={() => {
            setMenuOpen(false);
            setConfirmOpen(true);
          }}
        />
      </BottomSheet>

      <ConfirmSheet
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Delete this session?"
        description={`Its ${session.workingSets}-set log will be permanently deleted.`}
        confirmLabel="Delete session"
        busy={del.isPending}
        onConfirm={() => del.mutate()}
      />
    </>
  );
}
