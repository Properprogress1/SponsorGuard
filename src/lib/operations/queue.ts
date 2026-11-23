import { formatUkDate, londonDate } from "@/lib/dates";
import { requireWorkspaceSession } from "@/lib/auth/access";
import { queueDates, type QueueFilter } from "./queue-filters";

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

export type QueueEntry = QueueItem & Assignment;

async function queueQuery(organisation: string) {
  const { client, claims } = await requireWorkspaceSession();
  const dates = queueDates();
  function select(filter: QueueFilter, head = false) {
    const query = client
      .from("weekly_queue_items")
      .select("kind,record_id,due_on,assignee,escalated,handed_back", {
        count: "exact",
        head,
      })
      .eq("organisation_id", organisation)
      .lte("due_on", dates.through);
    switch (filter) {
      case "overdue":
        return query.lt("due_on", dates.today);
      case "upcoming":
        return query.gte("due_on", dates.today);
      case "mine":
        return query.eq("assignee", claims.sub);
      case "unassigned":
        return query.is("assignee", null);
      case "handed_back":
        return query.eq("handed_back", true);
      default:
        return query;
    }
  }
  return { select, dates };
}

export async function getWeeklyQueue(
  organisation: string,
  filter: QueueFilter = "all",
  page = 1,
  size = 25,
) {
  const { select, dates } = await queueQuery(organisation);
  const start = (page - 1) * size;
  const sources = await select(filter)
    .order("due_on")
    .order("kind")
    .order("record_id")
    .range(start, start + size - 1)
    .returns<QueueEntry[]>();
  if (sources.error?.code === "PGRST103")
    return { rows: [], count: 0, today: dates.today };
  if (sources.error) throw new Error("Could not load the weekly action queue.");
  return {
    rows: sources.data,
    count: sources.count ?? sources.data.length,
    today: dates.today,
  };
}

export async function getQueueSummary(organisation: string) {
  const { select } = await queueQuery(organisation);
  const filters = ["overdue", "upcoming", "handed_back"] as const;
  return Promise.all(
    filters.map(async (filter) => {
      const { count, error } = await select(filter, true);
      if (error) throw new Error("Could not load the queue summary.");
      return { filter, count: count ?? 0 };
    }),
  );
}
