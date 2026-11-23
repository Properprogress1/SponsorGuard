import { formatUkDate, londonDate } from "@/lib/dates";
import { requireWorkspaceSession } from "@/lib/auth/access";

export const queueLabels = {
  reporting: { title: "Complete a reporting task", section: "tasks" },
  document: { title: "Review document expiry", section: "documents" },
  rtw: {
    title: "Follow up a right-to-work check",
    section: "people?category=rtw",
  },
} as const;
export type QueueKind = keyof typeof queueLabels;
export type QueueItem = { kind: QueueKind; record_id: string; due_on: string };
export type Assignment = {
  kind: QueueKind;
  record_id: string;
  assignee: string | null;
  escalated: boolean;
  handed_back: boolean;
};

export function dueLabel(date: string, now = new Date()) {
  const today = londonDate(now);
  return `${date < today ? "Overdue" : date === today ? "Due today" : "Due"} · ${formatUkDate(date)}`;
}

export async function getWeeklyQueue(organisation: string) {
  const { client } = await requireWorkspaceSession();
  const today = new Date(`${londonDate()}T00:00:00Z`);
  today.setUTCDate(today.getUTCDate() + 7);
  const through = today.toISOString().slice(0, 10);
  const sources = await client
    .from("weekly_action_sources")
    .select("kind, record_id, due_on", { count: "exact" })
    .eq("organisation_id", organisation)
    .lte("due_on", through)
    .order("due_on")
    .order("record_id")
    .limit(50)
    .returns<QueueItem[]>();
  if (sources.error) throw new Error("Could not load the weekly action queue.");
  const rows = sources.data;
  if (!rows.length) return { rows, assignments: [], count: 0 };
  const assignments = await client
    .from("weekly_actions")
    .select("kind, record_id, assignee, escalated, handed_back")
    .eq("organisation_id", organisation)
    .in(
      "record_id",
      rows.map((row) => row.record_id),
    )
    .returns<Assignment[]>();
  if (assignments.error) throw new Error("Could not load action ownership.");
  return {
    rows,
    assignments: assignments.data,
    count: sources.count ?? rows.length,
  };
}
