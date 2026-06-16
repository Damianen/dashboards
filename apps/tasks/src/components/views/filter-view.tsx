"use client";

import { Filter, Pencil } from "lucide-react";
import * as React from "react";

import { useSheets } from "@/components/providers/sheet-provider";
import { EmptyState } from "@/components/tasks/empty-state";
import { TaskList } from "@/components/tasks/task-list";
import {
  useProjectTree,
  useSavedFilters,
  useSavedFilterTasks,
} from "@/hooks/use-task-queries";
import { ActionError } from "@/server/actions/result";
import type { SavedFilter } from "@/generated/prisma/client";
import type { ProjectTreeNode } from "@/server/services/projects";
import type { TaskWithLabels } from "@/server/services/tasks";

import { ViewHeader } from "./view-header";

export function FilterView({
  filterId,
  initialFilter,
  initialTasks,
  initialTree,
}: {
  filterId: string;
  initialFilter: SavedFilter;
  initialTasks?: TaskWithLabels[];
  initialTree: ProjectTreeNode[];
}) {
  const { openSavedFilter } = useSheets();
  const filters = useSavedFilters();
  // Live copy so an edit updates the header + re-runs with the new query.
  const filter = filters.data?.find((f) => f.id === filterId) ?? initialFilter;

  const tasks = useSavedFilterTasks(filterId, filter.query, initialTasks);
  const tree = useProjectTree(initialTree);
  const projectNames = React.useMemo(
    () => new Map((tree.data ?? []).map((p) => [p.id, p.name])),
    [tree.data],
  );

  const syntaxError =
    tasks.error instanceof ActionError && tasks.error.code === "FILTER_SYNTAX"
      ? tasks.error.message
      : null;
  const results = tasks.data ?? [];

  return (
    <div className="flex flex-col animate-in fade-in slide-in-from-bottom-1">
      <ViewHeader
        title={filter.name}
        leading={<Filter className="size-4 shrink-0" style={{ color: filter.color }} />}
        action={
          <button
            type="button"
            onClick={() => openSavedFilter({ filter })}
            aria-label="Edit filter"
            className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground active:bg-muted"
          >
            <Pencil className="size-5" aria-hidden />
          </button>
        }
      />
      <p className="px-1 py-2 font-mono text-xs text-muted-foreground">
        {filter.query}
      </p>
      {syntaxError ? (
        <p className="mx-1 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive" role="alert">
          {syntaxError}
        </p>
      ) : results.length === 0 && !tasks.isFetching ? (
        <EmptyState
          icon={<Filter className="size-10" />}
          title="No tasks match this filter"
        />
      ) : (
        <TaskList tasks={results} showProject projectNames={projectNames} />
      )}
    </div>
  );
}
