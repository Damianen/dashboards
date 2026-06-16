"use server";

import type { OrderRefInput, SavedFilterCreateInput, SavedFilterUpdateInput } from "@/lib/schemas";
import * as savedFilters from "@/server/services/saved-filters";

import { toActionResult } from "./result";

export async function listSavedFiltersAction() {
  return toActionResult(() => savedFilters.listSavedFilters());
}

export async function getSavedFilterAction(id: string) {
  return toActionResult(() => savedFilters.getSavedFilter(id));
}

export async function createSavedFilterAction(input: SavedFilterCreateInput) {
  return toActionResult(() => savedFilters.createSavedFilter(input));
}

export async function updateSavedFilterAction(
  id: string,
  input: SavedFilterUpdateInput,
) {
  return toActionResult(() => savedFilters.updateSavedFilter(id, input));
}

export async function deleteSavedFilterAction(id: string) {
  return toActionResult(() => savedFilters.deleteSavedFilter(id));
}

export async function reorderSavedFilterAction(id: string, ref: OrderRefInput) {
  return toActionResult(() => savedFilters.reorderSavedFilter(id, ref));
}
