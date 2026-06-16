"use client";

import { ArrowLeft, Filter } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { useSheets } from "@/components/providers/sheet-provider";
import { EmptyState } from "@/components/tasks/empty-state";
import { TaskList } from "@/components/tasks/task-list";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useFreeformFilter, useProjectTree } from "@/hooks/use-task-queries";
import { ActionError } from "@/server/actions/result";
import type { ProjectTreeNode } from "@/server/services/projects";

const PLACEHOLDER = "(today | overdue) & #School & !@waiting";

export function FilterBarView({
  initialTree,
}: {
  initialTree: ProjectTreeNode[];
}) {
  const { openSavedFilter } = useSheets();
  const [raw, setRaw] = React.useState("");
  const query = useDebouncedValue(raw.trim(), 300);
  const filter = useFreeformFilter(query);
  const tree = useProjectTree(initialTree);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const projectNames = React.useMemo(
    () => new Map((tree.data ?? []).map((p) => [p.id, p.name])),
    [tree.data],
  );

  React.useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const syntaxError =
    filter.error instanceof ActionError && filter.error.code === "FILTER_SYNTAX"
      ? filter.error.message
      : null;
  const results = filter.data ?? [];
  const hasQuery = query.length > 0;

  return (
    <div className="flex flex-col animate-in fade-in slide-in-from-bottom-1">
      <div className="sticky top-0 z-10 -mx-4 border-b bg-background/85 px-4 py-2 backdrop-blur">
        <div className="flex items-center gap-1">
          <Link
            href="/browse"
            aria-label="Back"
            className="-ml-3 flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground active:bg-muted"
          >
            <ArrowLeft className="size-5" aria-hidden />
          </Link>
          <div className="flex flex-1 items-center gap-2 rounded-xl bg-muted px-3">
            <Filter
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden
            />
            <input
              ref={inputRef}
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              type="text"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="search"
              placeholder={PLACEHOLDER}
              aria-label="Filter expression"
              className="h-11 w-full bg-transparent text-base outline-none placeholder:text-muted-foreground"
            />
          </div>
          <button
            type="button"
            onClick={() => openSavedFilter({ query })}
            disabled={!hasQuery || syntaxError !== null}
            className="shrink-0 rounded-lg px-2 text-sm font-medium text-primary disabled:opacity-40"
          >
            Save
          </button>
        </div>
        {syntaxError && (
          <p className="mt-1 px-1 text-xs text-destructive" role="alert">
            {syntaxError}
          </p>
        )}
      </div>

      {!hasQuery ? (
        <EmptyState
          icon={<Filter className="size-10" />}
          title="Filter your tasks"
          hint="Combine terms with & | ! and parentheses, e.g. today & p1 & !@waiting."
        />
      ) : results.length === 0 && !filter.isFetching && !syntaxError ? (
        <EmptyState title="No tasks match this filter" />
      ) : (
        <TaskList tasks={results} showProject projectNames={projectNames} />
      )}
    </div>
  );
}
