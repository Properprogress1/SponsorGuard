// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import { unzipSync } from "fflate";
import { createAuditArchive } from "./archive";
import {
  auditPackDisclaimer,
  maxSourceBytes,
  parseChecklist,
  type PackSnapshot,
} from "./model";

const docId = "00000000-0000-4000-8000-000000011901";
const bytes = Uint8Array.from([1, 2, 3]);
const snapshot: PackSnapshot = {
  name: "Synthetic Seed",
  generated_at: "2026-11-23T09:00:00.000Z",
  checklist: ["Review records", "Review follow-ups"],
  workers: [
    {
      reference: "DEMO-SW-01",
      full_name: "Synthetic Worker",
      status: "active",
    },
  ],
  individuals: [
    {
      reference: "DEMO-EI-01",
      full_name: "Synthetic Individual",
      category: "Employee",
    },
  ],
  checks: [
    {
      id: "1",
      person_reference: "DEMO-EI-01",
      person_type: "Engaged individual",
      checked_on: "2026-07-01",
      method: "online",
      follow_up_on: "2026-11-23",
    },
  ],
  reporting: [
    {
      id: "2",
      description: "Synthetic event",
      version: 1,
      event_on: "2026-07-01",
      due_on: "2026-07-14",
      completed: false,
    },
  ],
  personnel: [
    {
      role: "Key Contact",
      full_name: "Synthetic Contact",
      sms_mfa: "enabled",
      sms_last_login_on: "2026-11-23",
      leaving: false,
    },
  ],
  documents: [
    {
      id: docId,
      document_type: "identity",
      person_reference: "DEMO-SW-01",
      person_type: "Sponsored worker",
      issued_on: null,
      expires_on: null,
      content_type: "application/pdf",
      size_bytes: bytes.length,
    },
  ],
  ledger: { valid: true, checked_entries: 4, first_invalid_sequence: null },
};

describe("audit pack", () => {
  it("opens as a ZIP containing a PDF, the recorded checklist and the unchanged source document", async () => {
    const contents = unzipSync(
      await createAuditArchive(snapshot, async () => bytes),
    );
    expect(Object.keys(contents).sort()).toEqual([
      `documents/${docId}.pdf`,
      "index.pdf",
      "records.json",
    ]);
    expect(contents[`documents/${docId}.pdf`]).toEqual(bytes);
    const pdf = Buffer.from(contents["index.pdf"]).toString("latin1");
    expect(pdf.startsWith("%PDF-")).toBe(true);
    expect(pdf).toMatch(/startxref\s+\d+\s+%%EOF/);
    expect(
      JSON.parse(Buffer.from(contents["records.json"]).toString("utf8")),
    ).toMatchObject({
      ...snapshot,
      disclaimer: auditPackDisclaimer,
      documents: [{ archive_path: `documents/${docId}.pdf` }],
    });
  });

  it("rejects oversized snapshots before download and fails closed on a missing source", async () => {
    const download = vi.fn(async () => new Uint8Array());
    await expect(
      createAuditArchive(
        {
          ...snapshot,
          documents: [
            { ...snapshot.documents[0], size_bytes: maxSourceBytes + 1 },
          ],
        },
        download,
      ),
    ).rejects.toMatchObject({ reason: "too_large" });
    expect(download).not.toHaveBeenCalled();
    await expect(createAuditArchive(snapshot, download)).rejects.toMatchObject({
      reason: "document_unavailable",
    });
  });

  it("keeps checklist order, supports an empty checklist, and validates lengths", () => {
    expect(parseChecklist("Second\r\n\n First ")).toEqual(["Second", "First"]);
    expect(parseChecklist(" ")).toEqual([]);
    expect(parseChecklist("x".repeat(121))).toBeNull();
  });
});
