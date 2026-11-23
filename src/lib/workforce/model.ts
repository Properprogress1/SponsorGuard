import { formatUkDate } from "@/lib/dates";

export const checkStatuses = {
  missing: "No check on file",
  due: "Follow-up due",
  scheduled: "Follow-up scheduled",
  recorded: "Check on file",
} as const;

export type EngagementCategory = { key: string; label: string };
export type WorkforceRow = {
  id: string;
  full_name: string;
  reference: string;
  engagement_type: string;
  engagement_label: string;
  check_responsibility: string | null;
  checked_on: string | null;
  follow_up_on: string | null;
  check_status: keyof typeof checkStatuses;
};
export const validCategoryKey = (value: string) =>
  /^[a-z][a-z0-9_-]{0,39}$/.test(value);
export const workforceFilters = (category: string, status: string) => ({
  category: validCategoryKey(category) ? category : "",
  status: Object.hasOwn(checkStatuses, status) ? status : "",
});
export function workforceQuery(filters: ReturnType<typeof workforceFilters>) {
  return new URLSearchParams(
    Object.entries(filters).filter(([, value]) => value),
  );
}

function csvCell(value: string) {
  const safe = /^[\s\u0000-\u001f]*[=+@-]|^[\t\r\n]/.test(value)
    ? "'" + value
    : value;
  return '"' + safe.replaceAll('"', '""') + '"';
}

export function workforceCsv(rows: WorkforceRow[]) {
  const records = rows.map((row) => [
    row.full_name,
    row.reference,
    row.engagement_label,
    row.check_responsibility ?? "",
    checkStatuses[row.check_status],
    row.checked_on ? formatUkDate(row.checked_on) : "",
    row.follow_up_on ? formatUkDate(row.follow_up_on) : "",
  ]);
  return (
    [
      [
        "Name",
        "Reference",
        "Engagement category",
        "Recorded responsibility for checks",
        "Check status",
        "Latest check date",
        "Follow-up date",
      ],
      ...records,
    ]
      .map((row) => row.map(csvCell).join(","))
      .join("\r\n") + "\r\n"
  );
}
