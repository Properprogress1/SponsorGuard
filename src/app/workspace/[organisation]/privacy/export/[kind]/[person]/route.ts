import { requireWorkspaceSession } from "@/lib/auth/access";
import { documentBucket, documentDownloadNames } from "@/lib/documents/model";
import { isRecordId } from "@/lib/people/records";
import { personJson, personPdf } from "@/lib/privacy/exports";
import {
  isPersonKind,
  maxPersonExportBytes,
  type ExportFile,
  type PersonExport,
} from "@/lib/privacy/model";
import { privacyService } from "@/lib/privacy/service";

const headers = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};
const fail = (status: number, message: string) =>
  new Response(message, { status, headers });

export async function GET(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ organisation: string; kind: string; person: string }>;
  },
) {
  const { organisation, kind, person } = await params;
  const format = new URL(request.url).searchParams.get("format");
  if (!isRecordId(organisation) || !isRecordId(person) || !isPersonKind(kind))
    return fail(404, "Person unavailable.");
  if (format !== "pdf" && format !== "json")
    return fail(400, "Choose PDF or JSON.");
  const { client } = await requireWorkspaceSession();
  const { data, error } = await client.rpc("export_privacy_person", {
    tenant: organisation,
    target_kind: kind,
    person,
    format_type: format,
  });
  if (error?.code === "42501" || !data)
    return fail(
      error && error.code !== "42501" ? 503 : 404,
      "Person export unavailable.",
    );
  if (error) return fail(503, "Person export unavailable.");
  const snapshot = data as PersonExport;
  if (
    snapshot.documents.reduce(
      (total, document) => total + document.size_bytes,
      0,
    ) > maxPersonExportBytes
  )
    return fail(413, "Linked files exceed the 25 MiB per-person export limit.");
  const files: ExportFile[] = [];
  if (snapshot.documents.length) {
    const storage = privacyService();
    if (!storage) return fail(503, "Document export unavailable.");
    const vault = storage.storage.from(documentBucket);
    for (const document of snapshot.documents) {
      const filename = documentDownloadNames[document.content_type];
      if (!filename || !isRecordId(document.id))
        return fail(503, "Document export unavailable.");
      const file = await vault.download(`${organisation}/${document.id}`);
      if (file.error || file.data.size !== document.size_bytes)
        return fail(503, "A linked document could not be included.");
      files.push({
        data: Buffer.from(await file.data.arrayBuffer()),
        metadata: document,
        name: `${document.id}.${filename.split(".").at(-1)}`,
      });
    }
  }
  return new Response(
    format === "pdf" ? personPdf(snapshot, files) : personJson(snapshot, files),
    {
      headers: {
        ...headers,
        "Content-Type":
          format === "pdf"
            ? "application/pdf"
            : "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="person-data.${format}"`,
      },
    },
  );
}
