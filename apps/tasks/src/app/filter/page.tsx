import { FilterBarView } from "@/components/views/filter-bar-view";
import { getProjectTree } from "@/server/services/projects";

export const dynamic = "force-dynamic";

export default async function FilterPage() {
  const tree = await getProjectTree();
  return <FilterBarView initialTree={tree} />;
}
