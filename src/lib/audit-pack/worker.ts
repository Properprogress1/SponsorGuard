import { documentBucket } from "@/lib/documents/model";
import { createAuditArchive, PackError } from "./archive";
import { auditPackBucket, auditPackPath, type PackFailure } from "./model";
import type { auditPackClient } from "./service";

export async function runAuditPack(
  client: NonNullable<ReturnType<typeof auditPackClient>>,
) {
  const result = await client.rpc("claim_audit_pack");
  if (result.error) throw new Error("Could not claim an audit pack.");
  const claim = result.data[0];
  if (!claim) return "idle";

  const args = { job: claim.id, lease: claim.attempt };
  const output = client.storage.from(auditPackBucket);
  const target = auditPackPath(claim);
  let generated: string | null = null;
  let problem: PackFailure | null = null;
  try {
    const snapshot = await client.rpc("audit_pack_snapshot", args);
    if (snapshot.error)
      throw new Error("Could not read the audit pack snapshot.");
    if (!snapshot.data) throw new PackError("access_changed");
    const archive = await createAuditArchive(
      snapshot.data,
      async (document) => {
        const download = await client.storage
          .from(documentBucket)
          .download(`${claim.organisation_id}/${document.id}`);
        if (download.error || download.data.size !== document.size_bytes)
          throw new PackError("document_unavailable");
        return new Uint8Array(await download.data.arrayBuffer());
      },
    );
    const uploaded = await output.upload(target, archive, {
      contentType: "application/zip",
      upsert: false,
    });
    if (uploaded.error) throw new Error("Could not upload the audit pack.");
    generated = snapshot.data.generated_at;
  } catch (error) {
    problem = error instanceof PackError ? error.reason : "generation_failed";
  }

  const finished = await client.rpc("finish_audit_pack", {
    ...args,
    generated,
    problem,
  });
  if (finished.error)
    throw new Error("Could not record the audit pack outcome.");
  if (!finished.data && generated) await output.remove([target]);
  return finished.data && generated ? "ready" : "failed";
}
