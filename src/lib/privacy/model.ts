import type { DocumentMime } from "@/lib/documents/model";

export const personKinds = {
  worker: "Sponsored worker",
  individual: "Engaged individual",
  personnel: "Key personnel",
} as const;
export type PersonKind = keyof typeof personKinds;
export const isPersonKind = (kind: unknown): kind is PersonKind =>
  typeof kind === "string" && Object.hasOwn(personKinds, kind);

export const privacyActions = {
  passport_opened: "Shared Passport opened",
  passport_incorrect_passcode: "Shared Passport passcode rejected",
  passport_rate_limited: "Shared Passport attempt limit reached",
  export_json: "Person JSON export requested",
  export_pdf: "Person PDF export requested",
  document_link: "Document download link issued",
  audit_pack_link: "Audit pack download link issued",
  manual_erasure: "Person records erased",
  retention_erasure: "Person records erased by retention",
  retention_configured: "Retention rule version added",
  person_controls_changed: "Person retention or hold changed",
} as const;
export type PrivacyAction = keyof typeof privacyActions;
type RecordData = Record<string, string | number | boolean | null>;
export type ExportDocument = RecordData & {
  id: string;
  content_type: DocumentMime;
  size_bytes: number;
};
export type PersonExport = {
  person: RecordData;
  kind: PersonKind;
  exported_at: string;
  right_to_work_checks: RecordData[];
  certificates_of_sponsorship: RecordData[];
  documents: ExportDocument[];
  handover_tasks: RecordData[];
  retention_controls: RecordData | null;
};
export type ExportFile = {
  data: Buffer;
  metadata: ExportDocument;
  name: string;
};
export const maxPersonExportBytes = 25 * 1024 * 1024;
