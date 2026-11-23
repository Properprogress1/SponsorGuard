import type { DocumentMime, DocumentType } from "@/lib/documents/model";

export const auditPackBucket = "sponsorguard-audit-packs";
export const maxSourceBytes = 40 * 1024 * 1024;
export const maxArchiveBytes = 45 * 1024 * 1024;
export const auditPackDisclaimer =
  "SponsorGuard tracks your records. It does not provide immigration advice or guarantee compliance.";
export const defaultChecklist = [
  "Check the worker register",
  "Review follow-up dates",
  "Review the document list and ledger summary",
];
export const packFailures = {
  too_large: "Records exceed the current audit pack size limit.",
  document_unavailable: "A document listed in the vault could not be included.",
  generation_failed: "The audit pack could not be generated.",
  privacy_erasure: "Invalidated by a person data erasure.",
  access_changed: "The requester no longer has access to generate audit packs.",
} as const;
export type PackFailure = keyof typeof packFailures;
export type PackClaim = {
  id: string;
  organisation_id: string;
  attempt: string;
};
type PersonRef = { person_reference: string; person_type: string };
export type PackDocument = PersonRef & {
  id: string;
  document_type: DocumentType;
  content_type: DocumentMime;
  size_bytes: number;
  issued_on: string | null;
  expires_on: string | null;
};
export type PackSnapshot = {
  name: string;
  generated_at: string;
  checklist: string[];
  workers: { reference: string; full_name: string; status: string }[];
  individuals: { reference: string; full_name: string; category: string }[];
  checks: (PersonRef & {
    id: string;
    checked_on: string;
    method: string;
    follow_up_on: string | null;
  })[];
  reporting: {
    id: string;
    event_on: string;
    due_on: string;
    description: string;
    version: number;
    completed: boolean | null;
  }[];
  personnel: {
    role: string;
    full_name: string;
    sms_mfa: string;
    sms_last_login_on: string | null;
    leaving: boolean;
  }[];
  documents: PackDocument[];
  ledger: {
    valid: boolean;
    checked_entries: number;
    first_invalid_sequence: number | null;
  };
};

export function auditPackPath(claim: PackClaim) {
  return `${claim.organisation_id}/${claim.id}/${claim.attempt}.zip`;
}

export function parseChecklist(value: string) {
  const items = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return items.length <= 30 &&
    items.every((line) => line.length <= 120 && !/[\p{Cc}]/u.test(line))
    ? items
    : null;
}
