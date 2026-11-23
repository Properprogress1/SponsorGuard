import { privacyService } from "@/lib/privacy/service";
import { requireWorkspaceSession } from "@/lib/auth/access";
import { auditPackBucket, auditPackPath } from "@/lib/audit-pack/model";
import { auditPackClient } from "@/lib/audit-pack/service";
import { signedDownloadSeconds } from "@/lib/documents/model";
import { isRecordId } from "@/lib/people/records";

const headers = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
};

export async function GET(
  _: Request,
  { params }: { params: Promise<{ organisation: string; job: string }> },
) {
  const { organisation, job } = await params;
  const { client, claims } = await requireWorkspaceSession();
  if (!isRecordId(organisation) || !isRecordId(job))
    return new Response(null, { status: 404, headers });

  const { data, error } = await client
    .from("audit_pack_jobs")
    .select("attempt")
    .eq("organisation_id", organisation)
    .eq("id", job)
    .eq("status", "ready")
    .maybeSingle<{ attempt: string }>();
  if (error || !data?.attempt)
    return new Response(null, { status: error ? 503 : 404, headers });
  const storage = auditPackClient();
  if (!storage) return new Response(null, { status: 503, headers });

  const signed = await storage.storage.from(auditPackBucket).createSignedUrl(
    auditPackPath({
      organisation_id: organisation,
      id: job,
      attempt: data.attempt,
    }),
    signedDownloadSeconds,
    { download: "sponsorguard-audit-pack.zip" },
  );
  if (signed.error) return new Response(null, { status: 503, headers });
  const log = await privacyService()?.rpc("log_privacy_download", {
    tenant: organisation,
    download_kind: "audit_pack_link",
    item: job,
    actor: claims.sub,
  });
  if (!log || log.error) return new Response(null, { status: 503, headers });
  return new Response(null, {
    status: 303,
    headers: { ...headers, Location: signed.data.signedUrl },
  });
}
