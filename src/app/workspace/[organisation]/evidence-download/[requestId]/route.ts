import { requireWorkspaceSession } from "@/lib/auth/access";
import { documentBucket, signedDownloadSeconds } from "@/lib/documents/model";
import { evidenceStorage } from "@/lib/operations/evidence";
import { isRecordId } from "@/lib/people/records";

export async function GET(
  _: Request,
  context: RouteContext<"/workspace/[organisation]/evidence-download/[requestId]">,
) {
  const { organisation, requestId } = await context.params;
  const { client } = await requireWorkspaceSession();
  if (!isRecordId(organisation) || !isRecordId(requestId))
    return new Response(null, { status: 404 });
  const ticket = await client
    .from("evidence_requests")
    .select("document_id")
    .match({ organisation_id: organisation, id: requestId, state: "submitted" })
    .maybeSingle<{ document_id: string | null }>();
  if (ticket.error || !ticket.data?.document_id)
    return new Response(null, { status: 404 });
  const service = evidenceStorage();
  if (!service) return new Response(null, { status: 503 });
  const { data, error } = await service.storage
    .from(documentBucket)
    .createSignedUrl(
      `${organisation}/${ticket.data.document_id}`,
      signedDownloadSeconds,
      { download: true },
    );
  if (error || !data) return new Response(null, { status: 404 });
  return new Response(null, {
    status: 303,
    headers: { Location: data.signedUrl, "Cache-Control": "private, no-store" },
  });
}
