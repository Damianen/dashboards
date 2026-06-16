"use client";

import { Search } from "lucide-react";
import * as React from "react";

import { EmptyState } from "@/components/tasks/empty-state";
import { TaskList } from "@/components/tasks/task-list";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useProjectTree, useSearch } from "@/hooks/use-task-queries";
import type { ProjectTreeNode } from "@/server/services/projects";

export function SearchView({ initialTree }: { initialTree: ProjectTreeNode[] }) {
  const [raw, setRaw] = React.useState("");
  const query = useDebouncedValue(raw.trim(), 300);
  const search = useSearch(query);
  const tree = useProjectTree(initialTree);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const projectNames = React.useMemo(
    () => new Map((tree.data ?? []).map((p) => [p.id, p.name])),
    [tree.data],
  );

  React.useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const results = search.data ?? [];
  const hasQuery = query.length > 0;

  return (
    <div className="flex flex-col animate-in fade-in slide-in-from-bottom-1">
      <div className="sticky top-0 z-10 -mx-4 border-b bg-background/85 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-2 rounded-xl bg-muted px-3">
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <input
            ref={inputRef}
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            type="search"
            enterKeyHint="search"
            placeholder="Search tasks"
            aria-label="Search tasks"
            className="h-11 w-full bg-transparent text-base outline-none placeholder:text-muted-foreground"
          />
        </div>
      </div>

      {!hasQuery ? (
        <EmptyState
          icon={<Search className="size-10" />}
          title="Search your tasks"
          hint="Find anything by title or description."
        />
      ) : results.length === 0 && !search.isFetching ? (
        <EmptyState title={`No matches for “${query}”`} />
      ) : (
        <TaskList tasks={results} showProject projectNames={projectNames} />
      )}
    </div>
  );
}
