import { BrowseView } from "@/components/views/browse-view";
import { listLabels } from "@/server/services/labels";
import { getProjectTree } from "@/server/services/projects";
import { listSavedFilters } from "@/server/services/saved-filters";

export const dynamic = "force-dynamic";

export default async function BrowsePage() {
  const [tree, labels, filters] = await Promise.all([
    getProjectTree(),
    listLabels(),
    listSavedFilters(),
  ]);
  return (
    <BrowseView
      initialTree={tree}
      initialLabels={labels}
      initialFilters={filters}
    />
  );
}
