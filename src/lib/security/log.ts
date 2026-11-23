export type RateOperation =
  | "auth_sign_in"
  | "auth_sign_up"
  | "auth_reset_request"
  | "auth_confirm"
  | "auth_mfa_enrol"
  | "auth_mfa_verify"
  | "auth_password_update"
  | "passport_read"
  | "passport_manage"
  | "partner_invite_read";

type SecurityEvent =
  | {
      event: "rate_limit";
      operation: RateOperation;
      outcome: "blocked" | "unavailable";
    }
  | { event: "stripe_webhook"; outcome: "rejected" | "retry" }
  | {
      event: "scheduled_job";
      job: "privacy" | "audit_packs" | "notifications";
      outcome: "complete" | "failed" | "retry";
    };

// Build the payload explicitly so a caller cannot attach an error, URL or user data.
export function securityLog(entry: SecurityEvent) {
  const timestamp = new Date().toISOString();
  const common = { timestamp, event: entry.event, outcome: entry.outcome };
  const fields =
    entry.event === "rate_limit"
      ? { operation: entry.operation }
      : entry.event === "scheduled_job"
        ? { job: entry.job }
        : {};
  console.info(JSON.stringify({ ...common, ...fields }));
}
