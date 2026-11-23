import type { requireWorkspaceSession } from "@/lib/auth/access";
import type {
  EngagementCategory,
  WorkforceRow,
  workforceFilters,
} from "./model";

type Client = Awaited<ReturnType<typeof requireWorkspaceSession>>["client"];

export async function listEngagementCategories(
  client: Client,
  organisation: string,
) {
  const categories: EngagementCategory[] = [];
  const size = 250;
  for (let offset = 0; ; offset += size) {
    const { data, error } = await client
      .from("engagement_categories")
      .select("key, label")
      .eq("organisation_id", organisation)
      .order("label")
      .order("key")
      .range(offset, offset + size - 1)
      .returns<EngagementCategory[]>();
    if (error?.code === "PGRST103") return categories;
    if (error) throw new Error("Could not load engagement categories.");
    categories.push(...data);
    if (data.length < size) return categories;
  }
}

export async function listWorkforce(
  client: Client,
  organisation: string,
  filters: ReturnType<typeof workforceFilters>,
  offset: number,
  size: number,
) {
  let query = client
    .from("workforce_map")
    .select(
      "id, full_name, reference, engagement_type, engagement_label, check_responsibility, checked_on, follow_up_on, check_status",
    )
    .eq("organisation_id", organisation);
  if (filters.category) query = query.eq("engagement_type", filters.category);
  if (filters.status) query = query.eq("check_status", filters.status);
  const { data, error } = await query
    .order("engagement_label")
    .order("engagement_type")
    .order("full_name")
    .order("id")
    .range(offset, offset + size - 1)
    .returns<WorkforceRow[]>();
  if (error?.code === "PGRST103") return [];
  if (error) throw new Error("Could not load workforce records.");
  return data;
}
