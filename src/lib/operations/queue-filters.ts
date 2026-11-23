import { londonDate } from "@/lib/dates";

export const queueFilters = {
  all: "All actions",
  overdue: "Overdue",
  upcoming: "Due in the next seven days",
  mine: "My actions",
  unassigned: "Unassigned",
  handed_back: "Handed back",
} as const;

export type QueueFilter = keyof typeof queueFilters;

export function parseQueueFilter(
  value: string | string[] | undefined,
): QueueFilter {
  return typeof value === "string" && Object.hasOwn(queueFilters, value)
    ? (value as QueueFilter)
    : "all";
}

export function parseQueuePage(value: string | string[] | undefined) {
  return typeof value === "string" && /^[1-9][0-9]{0,5}$/.test(value)
    ? Number(value)
    : 1;
}

export function queueDates(now = new Date()) {
  const today = londonDate(now);
  const through = new Date(`${today}T00:00:00Z`);
  through.setUTCDate(through.getUTCDate() + 7);
  return { today, through: through.toISOString().slice(0, 10) };
}

export function queueHref(
  tenant: string,
  filter: QueueFilter,
  page = 1,
  item?: string,
) {
  const query = new URLSearchParams();
  if (filter !== "all") query.set("filter", filter);
  if (page > 1) query.set("page", String(page));
  if (item) query.set("item", item);
  const search = query.toString();
  return `/workspace/${tenant}/actions${search ? `?${search}` : ""}${item ? "#action-detail" : ""}`;
}
