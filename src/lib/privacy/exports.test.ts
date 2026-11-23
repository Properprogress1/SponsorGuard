// @vitest-environment node
import { expect, it } from "vitest";
import { personJson, personPdf } from "./exports";
import type { ExportFile, PersonExport } from "./model";

const file: ExportFile = {
  data: Buffer.from("synthetic original file"),
  name: "synthetic.pdf",
  metadata: { id: "fixture", content_type: "application/pdf", size_bytes: 23 },
};
const source: PersonExport = {
  person: { full_name: "Synthetic Example", reference: "DEMO" },
  kind: "worker",
  exported_at: "2026-11-23T09:00:00Z",
  right_to_work_checks: [{ checked_on: "2026-01-01" }],
  certificates_of_sponsorship: [],
  documents: [file.metadata],
  handover_tasks: [],
  retention_controls: { started_on: "2026-01-01", held: false },
};

it("exports complete metadata and original file contents as JSON", async () => {
  const value = await new Response(personJson(source, [file])).json();
  expect(value).toMatchObject({
    person: source.person,
    exported_at: source.exported_at,
    documents: [
      { filename: file.name, content_base64: file.data.toString("base64") },
    ],
  });
});

it("writes a PDF with a valid cross-reference and embeds the record and original document", async () => {
  const bytes = Buffer.from(
    await new Response(personPdf(source, [file])).arrayBuffer(),
  );
  const pdf = bytes.toString("latin1");
  expect(pdf).toMatch(/^%PDF-/);
  const pointer = /startxref\s+(\d+)/.exec(pdf)?.[1];
  expect(pdf.slice(Number(pointer), Number(pointer) + 4)).toBe("xref");
  expect(pdf).toContain("/EmbeddedFiles");
  expect(pdf).toContain("person-data.json");
  expect(pdf).toContain(file.name);
});
