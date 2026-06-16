"use client";

import { ChevronRight, Filter, Hash, Inbox, Plus, Star } from "lucide-react";
import Link from "next/link";

import {
  useLabels,
  useProjectTree,
  useSavedFilters,
} from "@/hooks/use-task-queries";
import type { Label, SavedFilter } from "@/generated/prisma/client";
import type { ProjectTreeNode } from "@/server/services/projects";

export function BrowseView({
  initialTree,
  initialLabels,
  initialFilters,
}: {
  initialTree: ProjectTreeNode[];
  initialLabels: Label[];
  initialFilters: SavedFilter[];
}) {
  const tree = useProjectTree(initialTree);
  const labels = useLabels(initialLabels);
  const filters = useSavedFilters(initialFilters);
  const projects = tree.data ?? initialTree;
  const labelList = labels.data ?? initialLabels;
  const filterList = filters.data ?? initialFilters;

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-1">
      <h1 className="py-3 text-2xl font-semibold">Browse</h1>

      <section className="flex flex-col">
        <h2 className="px-1 pb-1 text-sm font-semibold text-muted-foreground">
          Filters
        </h2>
        <ul className="flex flex-col">
          {filterList.map((filter) => (
            <li key={filter.id}>
              <Link
                href={`/filter/${filter.id}`}
                className="flex min-h-[52px] items-center gap-3 border-b border-border/60 py-2 active:bg-muted/50"
              >
                <Filter
                  className="size-5 shrink-0"
                  style={{ color: filter.color }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate text-sm">
                  {filter.name}
                </span>
                <ChevronRight
                  className="size-4 shrink-0 text-muted-foreground/50"
                  aria-hidden
                />
              </Link>
            </li>
          ))}
          <li>
            <Link
              href="/filter"
              className="flex min-h-[52px] items-center gap-3 border-b border-border/60 py-2 active:bg-muted/50"
            >
              <Plus className="size-5 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                New filter…
              </span>
              <ChevronRight
                className="size-4 shrink-0 text-muted-foreground/50"
                aria-hidden
              />
            </Link>
          </li>
        </ul>
      </section>

      <section className="flex flex-col">
        <h2 className="px-1 pb-1 text-sm font-semibold text-muted-foreground">
          Projects
        </h2>
        <ul className="flex flex-col">
          {projects.map((project) => (
            <li key={project.id}>
              <Link
                href={`/project/${project.id}`}
                className="flex min-h-[52px] items-center gap-3 border-b border-border/60 py-2 active:bg-muted/50"
              >
                {project.isInbox ? (
                  <Inbox className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                ) : (
                  <Hash className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                )}
                <span className="min-w-0 flex-1 truncate text-sm">
                  {project.name}
                </span>
                {project.isFavorite && (
                  <Star
                    className="size-4 shrink-0 fill-amber-400 text-amber-400"
                    aria-label="Favorite"
                  />
                )}
                {project.incompleteTaskCount > 0 && (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {project.incompleteTaskCount}
                  </span>
                )}
                <ChevronRight
                  className="size-4 shrink-0 text-muted-foreground/50"
                  aria-hidden
                />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {labelList.length > 0 && (
        <section className="flex flex-col">
          <h2 className="px-1 pb-1 text-sm font-semibold text-muted-foreground">
            Labels
          </h2>
          <ul className="flex flex-col">
            {labelList.map((label) => (
              <li key={label.id}>
                <Link
                  href={`/label/${label.id}`}
                  className="flex min-h-[52px] items-center gap-3 border-b border-border/60 py-2 active:bg-muted/50"
                >
                  <span
                    aria-hidden
                    className="size-3 shrink-0 rounded-full"
                    style={{ backgroundColor: label.color }}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {label.name}
                  </span>
                  <ChevronRight
                    className="size-4 shrink-0 text-muted-foreground/50"
                    aria-hidden
                  />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
