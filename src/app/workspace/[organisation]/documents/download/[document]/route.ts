import { privacyService } from "@/lib/privacy/service";
import { notFound } from "next/navigation";
import { requireWorkspaceSession } from "@/lib/auth/access";
import {
  documentBucket,
  documentDownloadNames,
  signedDownloadSeconds,
  type DocumentMime,
} from "@/lib/documents/model";
import { isRecordId } from "@/lib/people/records";

export async function GET(
  _: Request,
  { params }: { params: Promise<{ organisation: string; document: string }> },
) {
  const { organisation, document } = await params;
  if (!isRecordId(organisation) || !isRecordId(document)) notFound();
  const { client, claims } = await requireWorkspaceSession();
  const { data, error } = await client
    .from("documents")
    .select("object_path, content_type")
    .eq("organisation_id", organisation)
    .eq("id", document)
    .eq("state", "ready")
    .maybeSingle<{ object_path: string; content_type: DocumentMime }>();
  if (error || !data) notFound();

  const { data: signed, error: signingError } = await client.storage
    .from(documentBucket)
    .createSignedUrl(data.object_path, signedDownloadSeconds, {
      download: documentDownloadNames[data.content_type],
    });
  if (signingError || !signed?.signedUrl) notFound();
  const log = await privacyService()?.rpc("log_privacy_download", {
    tenant: organisation,
    download_kind: "document_link",
    item: document,
    actor: claims.sub,
  });
  if (!log || log.error) return new Response(null, { status: 503 });
  return new Response(null, {
    status: 303,
    headers: {
      Location: signed.signedUrl,
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
