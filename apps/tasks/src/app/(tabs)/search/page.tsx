import { SearchView } from "@/components/views/search-view";
import { getProjectTree } from "@/server/services/projects";

export const dynamic = "force-dynamic";

export default async function SearchPage() {
  const tree = await getProjectTree();
  return <SearchView initialTree={tree} />;
}
