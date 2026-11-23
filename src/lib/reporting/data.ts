import { requireWorkspaceSession } from "@/lib/auth/access";
import {
  dueSoonThrough,
  type DeadlineState,
  type ReportingRule,
} from "./model";

type Client = Awaited<ReturnType<typeof requireWorkspaceSession>>["client"];
type Task = { id: string; completed: boolean };
export type ReportingRow = {
  id: string;
  event_on: string;
  due_on: string;
  reporting_rules: ReportingRule;
  tasks: Task;
};

export async function listReportingRules(client: Client) {
  const rules: ReportingRule[] = [];
  const batchSize = 500;
  for (let offset = 0; ; offset += batchSize) {
    const { data, error } = await client
      .from("reporting_rules")
      .select(
        "key, description, version, working_day_limit, source_reference, effective_from, effective_to, requires_verification",
      )
      .order("id")
      .range(offset, offset + batchSize - 1)
      .returns<ReportingRule[]>();
    if (error?.code === "PGRST103") return rules;
    if (error) throw new Error("Could not load reporting rules.");
    rules.push(...data);
    if (data.length < batchSize) return rules;
  }
}

export async function listReportingEvents(
  client: Client,
  organisation: string,
  today: string,
  state: DeadlineState | undefined,
  page: number,
) {
  const pageSize = 25;
  const offset = (page - 1) * pageSize;
  let query = client
    .from("reporting_events")
    .select(
      `
    id, event_on, due_on, reporting_rules!inner(key, description, version, working_day_limit,
    source_reference, effective_from, effective_to, requires_verification), tasks!inner(id, completed)
  `,
      { count: "exact" },
    )
    .eq("organisation_id", organisation);

  if (state) query = query.eq("tasks.completed", state === "completed");
  if (state === "overdue") query = query.lt("due_on", today);
  if (state === "soon")
    query = query.gte("due_on", today).lte("due_on", dueSoonThrough(today));
  if (state === "upcoming") query = query.gt("due_on", dueSoonThrough(today));

  const { data, error, count } = await query
    .order("due_on")
    .order("id")
    .range(offset, offset + pageSize - 1)
    .returns<ReportingRow[]>();
  if (error && error.code !== "PGRST103")
    throw new Error("Could not load reporting records.");
  return { rows: data ?? [], count: count ?? 0, pageSize };
}
