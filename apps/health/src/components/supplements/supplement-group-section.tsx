"use client";

import { SupplementChecklistRow } from "@/components/supplements/supplement-checklist-row";
import { useCheckGroup, useUncheckGroup } from "@/lib/hooks/use-supplements";
import { SUPPLEMENT_TIME_GROUP_LABELS } from "@/lib/schemas/supplement";
import type { ChecklistGroup } from "@/lib/supplement-checklist";

/** One time-group section: header (label + done count + a mark-all / clear-all
 *  toggle) and the group's checklist rows. */
export function SupplementGroupSection({
  day,
  group,
}: {
  day: string;
  group: ChecklistGroup;
}) {
  const checkGroup = useCheckGroup(day);
  const uncheckGroup = useUncheckGroup(day);
  const pending = checkGroup.isPending || uncheckGroup.isPending;

  const allDone = group.total > 0 && group.doneCount === group.total;

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">
          {SUPPLEMENT_TIME_GROUP_LABELS[group.timeGroup]}
          <span className="text-muted-foreground ml-2 text-sm font-normal tabular-nums">
            {group.doneCount}/{group.total} done
          </span>
        </h2>
        {group.total > 0 && (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              allDone
                ? uncheckGroup.mutate(group.timeGroup)
                : checkGroup.mutate(group.timeGroup)
            }
            className="text-primary text-sm font-medium disabled:opacity-50"
          >
            {allDone ? "Uncheck all" : "Mark all"}
          </button>
        )}
      </div>

      {group.total === 0 ? (
        <p className="text-muted-foreground text-sm">
          Nothing here yet.
        </p>
      ) : (
        <div className="space-y-2">
          {group.items.map((item) => (
            <SupplementChecklistRow key={item.id} day={day} item={item} />
          ))}
        </div>
      )}
    </section>
  );
}
