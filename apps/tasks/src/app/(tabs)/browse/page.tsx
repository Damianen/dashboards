import { BrowseView } from "@/components/views/browse-view";
import { listLabels } from "@/server/services/labels";
import { getProjectTree } from "@/server/services/projects";

export const dynamic = "force-dynamic";

export default async function BrowsePage() {
  const [tree, labels] = await Promise.all([getProjectTree(), listLabels()]);
  return <BrowseView initialTree={tree} initialLabels={labels} />;
}
