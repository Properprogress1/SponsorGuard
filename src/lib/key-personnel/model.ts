export const personnelRoles = [
  "Authorising Officer",
  "Key Contact",
  "Level 1 user",
] as const;
export const smsMfa = {
  unknown: "Unknown",
  enabled: "Enabled",
  disabled: "Disabled",
} as const;
export const handoverSteps = {
  confirm_replacement: "Identify a replacement or confirm cover",
  transfer_responsibilities: "Hand over responsibilities and open items",
  review_sms_access:
    "Review SMS access for the outgoing person and their replacement",
} as const;
export type Person = {
  id: string;
  full_name: string;
  role: string;
  sms_mfa: keyof typeof smsMfa;
  sms_last_login_on: string | null;
  leaving: boolean;
};

export function personnelAlerts(
  people: Person[],
  today: string,
  threshold: number | null,
) {
  const active = people.filter((person) => !person.leaving);
  const cutoff = Date.parse(today) - (threshold ?? 0) * 86_400_000;
  return {
    unfilled: personnelRoles.filter(
      (role) => !active.some((person) => person.role === role),
    ),
    inactive:
      threshold === null
        ? []
        : active.filter(
            (person) =>
              person.sms_last_login_on !== null &&
              Date.parse(person.sms_last_login_on) <= cutoff,
          ),
    missingLogin: active.filter((person) => person.sms_last_login_on === null),
  };
}
