import PDFDocument from "pdfkit";
import { zipSync } from "fflate";
import { formatUkDate } from "@/lib/dates";
import { documentDownloadNames, documentTypes } from "@/lib/documents/model";
import { londonTime } from "@/lib/passport/model";
import {
  auditPackDisclaimer,
  maxArchiveBytes,
  maxSourceBytes,
  type PackDocument,
  type PackFailure,
  type PackSnapshot,
} from "./model";

export class PackError extends Error {
  constructor(readonly reason: PackFailure) {
    super(reason);
  }
}

function archiveName(document: PackDocument) {
  const filename = documentDownloadNames[document.content_type];
  if (!filename || !/^[0-9a-f-]{36}$/.test(document.id))
    throw new PackError("document_unavailable");
  return `documents/${document.id}.${filename.split(".").at(-1)}`;
}

const date = (value: string | null) =>
  value ? formatUkDate(value) : "Not recorded";
const person = (value: { person_type: string; person_reference: string }) =>
  `${value.person_type} ${value.person_reference}`;

function pdfText(value: string) {
  const printable = /[^\x20-\x7e\u00a0-\u00ff\n–—‘’“”£]/u;
  return printable.test(value)
    ? value.replace(new RegExp(printable.source, "gu"), "?") +
        " (full text in records.json)"
    : value;
}

export async function createAuditIndex(snapshot: PackSnapshot) {
  const pdf = new PDFDocument({
    size: "A4",
    margin: 44,
    lang: "en-GB",
    info: {
      Title: "SponsorGuard audit pack",
      CreationDate: new Date(snapshot.generated_at),
    },
  });
  const output = new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    pdf.on("data", (chunk: Buffer) => chunks.push(chunk));
    pdf.once("end", () => resolve(Buffer.concat(chunks)));
    pdf.once("error", reject);
  });

  function section(title: string, rows: string[]) {
    if (pdf.y > pdf.page.height - 105) pdf.addPage();
    pdf.moveDown(0.8).font("Helvetica-Bold").fontSize(14).text(title);
    pdf.moveDown(0.3).font("Helvetica").fontSize(10);
    for (const row of rows.length ? rows : ["No records on file."]) {
      pdf.text(pdfText(row), { paragraphGap: 4, lineGap: 2 });
    }
  }

  pdf.font("Helvetica-Bold").fontSize(23).text("SponsorGuard audit pack");
  pdf.moveDown(0.4).font("Helvetica").fontSize(12).text(pdfText(snapshot.name));
  pdf
    .moveDown(0.4)
    .fontSize(10)
    .text(
      `Generated ${londonTime(snapshot.generated_at)} (Europe/London) | ${new Date(snapshot.generated_at).toISOString()}`,
    );
  pdf.moveDown(0.5).text(auditPackDisclaimer);
  pdf
    .moveDown(0.4)
    .text(
      "The archive includes a UTF-8 record index and the documents listed below.",
    );

  if (snapshot.checklist.length)
    section(
      "Organisation checklist",
      snapshot.checklist.map((item) => `[ ]  ${item}`),
    );
  section("Worker register", [
    ...snapshot.workers.map(
      (worker) =>
        `Sponsored worker ${worker.reference} | ${worker.full_name} | ${worker.status}`,
    ),
    ...snapshot.individuals.map(
      (worker) =>
        `Engaged individual ${worker.reference} | ${worker.full_name} | ${worker.category}`,
    ),
  ]);
  section(
    "Right-to-work check log",
    snapshot.checks.map(
      (check) =>
        `${person(check)} | Check date ${date(check.checked_on)} | ${check.method} | Follow-up ${date(check.follow_up_on)}`,
    ),
  );
  section(
    "Reporting events",
    snapshot.reporting.map(
      (event) =>
        `${event.description} (version ${event.version}) | Event ${date(event.event_on)} | Due ${date(event.due_on)} | Task ${event.completed === null ? "not recorded" : event.completed ? "completed" : "open"}`,
    ),
  );
  section(
    "Key personnel (self-reported)",
    snapshot.personnel.map(
      (record) =>
        `${record.role} | ${record.full_name} | SMS MFA ${record.sms_mfa} | Last SMS login ${date(record.sms_last_login_on)} | Leaving ${record.leaving ? "yes" : "no"}`,
    ),
  );
  section(
    "Document list",
    snapshot.documents.map(
      (document) =>
        `${documentTypes[document.document_type]} | ${person(document)} | Issued ${date(document.issued_on)} | Expires ${date(document.expires_on)}\n${archiveName(document)}`,
    ),
  );
  const ledger = snapshot.ledger;
  section("Ledger verification summary", [
    ledger.valid
      ? "Chain verification passed."
      : `Chain verification found an issue at sequence ${ledger.first_invalid_sequence}.`,
    `Entries checked: ${ledger.checked_entries}.`,
    "The ledger is tamper-evident. Verification checks the stored chain at generation time.",
  ]);
  pdf.end();
  return output;
}

export async function createAuditArchive(
  snapshot: PackSnapshot,
  download: (document: PackDocument) => Promise<Uint8Array>,
) {
  const totalRows =
    snapshot.workers.length +
    snapshot.individuals.length +
    snapshot.checks.length +
    snapshot.reporting.length +
    snapshot.personnel.length +
    snapshot.documents.length;
  const expectedBytes = snapshot.documents.reduce(
    (total, document) => total + document.size_bytes,
    0,
  );
  if (expectedBytes > maxSourceBytes || totalRows > 10_000)
    throw new PackError("too_large");

  const pdf = await createAuditIndex(snapshot);
  const manifest = {
    ...snapshot,
    disclaimer: auditPackDisclaimer,
    documents: snapshot.documents.map((document) => ({
      ...document,
      archive_path: archiveName(document),
    })),
  };
  const contents: Record<string, Uint8Array> = {
    "index.pdf": pdf,
    "records.json": Buffer.from(JSON.stringify(manifest, null, 2), "utf-8"),
  };
  for (const document of snapshot.documents) {
    const bytes = await download(document);
    if (bytes.byteLength !== document.size_bytes)
      throw new PackError("document_unavailable");
    contents[archiveName(document)] = bytes;
  }
  const archive = zipSync(contents, {
    level: 0,
    mtime: new Date(snapshot.generated_at),
  });
  if (archive.byteLength > maxArchiveBytes) throw new PackError("too_large");
  return Buffer.from(archive);
}
