"use server";

import * as labels from "@/server/services/labels";

import { toActionResult } from "./result";

export async function listLabelsAction() {
  return toActionResult(() => labels.listLabels());
}
