import PDFDocument from "pdfkit";
import { Readable } from "node:stream";
import { formatUkDate } from "@/lib/dates";
import { londonTime } from "@/lib/passport/model";
import { auditPackDisclaimer } from "@/lib/audit-pack/model";
import { personKinds, type ExportFile, type PersonExport } from "./model";

function manifest(snapshot: PersonExport) {
  return { ...snapshot, disclaimer: auditPackDisclaimer };
}

export function personJson(snapshot: PersonExport, files: ExportFile[]) {
  const encoder = new TextEncoder();
  // Stream each attachment separately to avoid an extra copy of the entire export.
  return new ReadableStream<Uint8Array>({
    start(controller) {
      const { documents: _metadata, ...index } = manifest(snapshot);
      void _metadata;
      controller.enqueue(
        encoder.encode(JSON.stringify(index).slice(0, -1) + ',"documents":['),
      );
      files.forEach(({ data, metadata, name }, i) => {
        const value = {
          ...metadata,
          filename: name,
          content_base64: data.toString("base64"),
        };
        controller.enqueue(
          encoder.encode((i ? "," : "") + JSON.stringify(value)),
        );
      });
      controller.enqueue(encoder.encode("]}"));
      controller.close();
    },
  });
}

export function personPdf(snapshot: PersonExport, files: ExportFile[]) {
  const pdf = new PDFDocument({
    size: "A4",
    margin: 44,
    lang: "en-GB",
    info: {
      Title: "SponsorGuard person data export",
      CreationDate: new Date(snapshot.exported_at),
    },
  });
  const stream = Readable.toWeb(pdf);
  const safeText = (value: string) => {
    const safe = value.replace(/[^\x20-\x7e\u00a0-\u00ff–—‘’“”£]/gu, "?");
    return value === safe
      ? safe
      : safe + " (full text in person-data.json attachment)";
  };
  pdf.font("Helvetica-Bold").fontSize(22).text("Person data export");
  pdf
    .moveDown(0.3)
    .font("Helvetica")
    .fontSize(11)
    .text(
      `${personKinds[snapshot.kind]} | Generated ${londonTime(snapshot.exported_at)} (London)`,
    );
  pdf.moveDown(0.6).text(auditPackDisclaimer);
  pdf
    .moveDown(0.5)
    .text(
      "The original files and the complete UTF-8 record are embedded as PDF attachments.",
    );

  const sections = {
    Person: [snapshot.person],
    "Right-to-work checks": snapshot.right_to_work_checks,
    "Certificates of Sponsorship": snapshot.certificates_of_sponsorship,
    Documents: snapshot.documents,
    "Handover tasks": snapshot.handover_tasks,
    "Retention and hold": snapshot.retention_controls
      ? [snapshot.retention_controls]
      : [],
  };
  for (const [title, rows] of Object.entries(sections)) {
    if (pdf.y > pdf.page.height - 105) pdf.addPage();
    pdf.moveDown(0.6).font("Helvetica-Bold").fontSize(14).text(title);
    pdf.moveDown(0.3).font("Helvetica").fontSize(10);
    if (!rows.length) pdf.text("No records on file.");
    for (const row of rows) {
      for (const [key, value] of Object.entries(row)) {
        const formatted =
          typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
            ? formatUkDate(value)
            : value === null
              ? "Not recorded"
              : String(value);
        pdf.text(safeText(`${key.replaceAll("_", " ")}: ${formatted}`));
      }
      pdf.moveDown(0.3);
    }
  }
  pdf.file(Buffer.from(JSON.stringify(manifest(snapshot), null, 2)), {
    name: "person-data.json",
    type: "application/json",
  });
  for (const file of files)
    pdf.file(file.data, { name: file.name, type: file.metadata.content_type });
  pdf.end();
  return stream as ReadableStream<Uint8Array>;
}
