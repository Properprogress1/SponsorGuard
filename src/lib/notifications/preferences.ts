export const topics = {
  tasks: "Open reporting and handover tasks",
  documents: "Document expiry reminders",
  rtw: "Right-to-work follow-ups due",
  personnel: "Key personnel continuity alerts",
} as const;
export type Preferences = Record<keyof typeof topics | "enabled", boolean>;

export const defaultPreferences: Preferences = {
  enabled: false,
  tasks: true,
  documents: true,
  rtw: true,
  personnel: true,
};
