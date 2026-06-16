// Human-name → id resolution for the MCP layer. Agents address projects,
// sections, and labels by name; these helpers turn those names into the ids
// the rest of the service layer works with. Matching is case-insensitive;
// an ambiguous name is a hard error rather than a silent pick.

import type { Label, Project, Section } from "@/generated/prisma/client";
import { prisma } from "@/server/db";

import { createLabel } from "./labels";
import { InvalidOperationError, NotFoundError } from "./errors";

function ambiguous(kind: string, name: string, matches: { name: string }[]): never {
  const names = matches.map((m) => `"${m.name}"`).join(", ");
  throw new InvalidOperationError(
    `${kind} name "${name}" is ambiguous — matches ${names}. Use a more specific name.`,
  );
}

/** Resolve an active (non-archived) project by name. */
export async function resolveProjectByName(name: string): Promise<Project> {
  const matches = await prisma.project.findMany({
    where: { name: { equals: name, mode: "insensitive" }, archivedAt: null },
  });
  if (matches.length === 0)
    throw new NotFoundError(
      `project "${name}" — create it with create_project first, or check`,
    );
  if (matches.length > 1) ambiguous("project", name, matches);
  return matches[0];
}

/** Resolve a section by name within a given project. */
export async function resolveSectionByName(
  projectId: string,
  name: string,
): Promise<Section> {
  const matches = await prisma.section.findMany({
    where: { projectId, name: { equals: name, mode: "insensitive" } },
  });
  if (matches.length === 0) throw new NotFoundError(`section "${name}"`);
  if (matches.length > 1) ambiguous("section", name, matches);
  return matches[0];
}

/**
 * Resolve label names to ids, creating any that don't exist yet (Todoist-style
 * convenience). Matching is case-insensitive, so "Work" reuses an existing
 * "work" rather than creating a duplicate. Input order is preserved, dupes
 * dropped.
 */
export async function resolveLabelNames(names: string[]): Promise<string[]> {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const raw of names) {
    const name = raw.trim();
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const existing: Label | null = await prisma.label.findFirst({
      where: { name: { equals: name, mode: "insensitive" } },
    });
    ids.push(existing ? existing.id : (await createLabel({ name })).id);
  }
  return ids;
}
