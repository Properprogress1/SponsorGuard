export type ReportingRule = {
  key: string;
  description: string;
  version: number;
  working_day_limit: number;
  source_reference: string;
  effective_from: string;
  effective_to: string | null;
  requires_verification: boolean;
};

export const deadlineStates = {
  overdue: "Overdue",
  soon: "Due soon",
  upcoming: "Upcoming",
  completed: "Completed",
} as const;

export type DeadlineState = keyof typeof deadlineStates;

// A display preference for the task list, independent of reporting rules.
const dueSoonCalendarDays = 3;

export function dueSoonThrough(today: string) {
  const date = new Date(`${today}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + dueSoonCalendarDays);
  return date.toISOString().slice(0, 10);
}

export function deadlineState(
  dueOn: string,
  completed: boolean,
  today: string,
): DeadlineState {
  if (completed) return "completed";
  if (dueOn < today) return "overdue";
  if (dueOn <= dueSoonThrough(today)) return "soon";
  return "upcoming";
}

export function isDeadlineState(value: unknown): value is DeadlineState {
  return typeof value === "string" && Object.hasOwn(deadlineStates, value);
}

export function rulesForDate(rules: ReportingRule[], eventOn: string) {
  const selected = new Map<string, ReportingRule>();
  for (const rule of rules) {
    if (rule.effective_from > eventOn) continue;
    const previous = selected.get(rule.key);
    if (
      !previous ||
      rule.effective_from > previous.effective_from ||
      (rule.effective_from === previous.effective_from &&
        rule.version > previous.version)
    ) {
      selected.set(rule.key, rule);
    }
  }
  return [...selected.values()]
    .filter((rule) => !rule.effective_to || eventOn < rule.effective_to)
    .sort((a, b) => a.description.localeCompare(b.description, "en-GB"));
}
