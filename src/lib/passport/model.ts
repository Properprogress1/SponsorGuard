export const scopes = {
  all: "All entries",
  people: "Selected people",
  dates: "Date range",
} as const;
export type ShareScope = keyof typeof scopes;
export const sharePageSize = 50;

export const recordLabels = {
  rtw_checks: "Right-to-work check",
  reporting_events: "Reporting event",
  documents: "Document",
  key_personnel: "Key personnel",
} as const;

export type PublicShareResult =
  | {
      status:
        "unavailable" | "passcode" | "incorrect" | "locked" | "rate_limited";
    }
  | {
      status: "open";
      entries: {
        record_type: keyof typeof recordLabels;
        operation: "created" | "updated" | "deleted";
        created_at: string;
      }[];
      has_more: boolean;
    };

export function londonTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/London",
  }).format(new Date(value));
}
