"use server";

import * as projects from "@/server/services/projects";

import { toActionResult } from "./result";

export async function getProjectTreeAction() {
  return toActionResult(() => projects.getProjectTree());
}
