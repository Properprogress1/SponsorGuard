"use server";

import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import {
  requireWorkspaceSession,
  isManager,
  workspaceMemberships,
} from "@/lib/auth/access";
import {
  documentBucket,
  isDocumentType,
  validateDocumentFile,
} from "@/lib/documents/model";
import { isRecordId } from "@/lib/people/records";
import {
  createShareToken,
  hashShareToken,
  validShareToken,
} from "@/lib/passport/secrets";
import { allowSecurityRequest } from "@/lib/security/rate-limit";
import { evidenceStorage } from "./evidence";
import { evidenceScanner } from "./scanner";
import type { Result } from "./actions";

type LinkState = Result & { token?: string };

async function manager(organisation: string) {
  const { client } = await requireWorkspaceSession();
  const membership = (await workspaceMemberships()).find(
    (row) =>
      row.organisation_id === organisation &&
      !row.via_partner &&
      isManager(row.role),
  );
  if (!membership) notFound();
  return client;
}

export async function createEvidenceRequest(
  organisation: string,
  _: LinkState,
  form: FormData,
): Promise<LinkState> {
  const client = await manager(organisation);
  if (!evidenceScanner())
    return {
      error:
        "External uploads are unavailable until malware scanning is configured.",
    };
  const worker = form.get("worker");
  const type = form.get("document_type");
  if (
    typeof worker !== "string" ||
    !isRecordId(worker) ||
    typeof type !== "string" ||
    !isDocumentType(type)
  )
    return { error: "Choose a worker and document type." };
  const token = createShareToken();
  const { error } = await client.from("evidence_requests").insert({
    organisation_id: organisation,
    worker_id: worker,
    document_type: type,
    token_hash: hashShareToken(token),
  });
  if (error)
    return {
      error: "Could not create the request. Check the worker and plan.",
    };
  revalidatePath(`/workspace/${organisation}/documents`);
  return {
    token,
    message: "Evidence request created. The link expires in seven days.",
  };
}

export async function reviewEvidence(
  organisation: string,
  id: string,
  _: Result,
  form: FormData,
): Promise<Result> {
  const client = await manager(organisation);
  const decision = form.get("decision");
  if (
    !isRecordId(id) ||
    typeof decision !== "string" ||
    !["approved", "rejected", "revoked"].includes(decision)
  )
    return { error: "Choose an available decision." };
  const { data, error } = await client.rpc("review_evidence_request", {
    tenant: organisation,
    request_id: id,
    decision,
  });
  if (error || !data)
    return {
      error: "This request could not be updated. Refresh and try again.",
    };
  revalidatePath(`/workspace/${organisation}/documents`);
  return {
    message:
      decision === "approved"
        ? "Evidence filed in the document vault."
        : decision === "rejected"
          ? "Submission rejected and queued for removal."
          : "Request revoked.",
  };
}

export async function submitEvidence(
  _: Result,
  form: FormData,
): Promise<Result> {
  const token = form.get("token");
  if (typeof token !== "string" || !validShareToken(token))
    return { error: "This upload link is unavailable." };
  if (!(await allowSecurityRequest("evidence_upload", token)))
    return { error: "Uploads are temporarily unavailable. Try again later." };
  const scanner = evidenceScanner();
  const service = evidenceStorage();
  if (!scanner || !service)
    return { error: "Uploads are temporarily unavailable." };
  const file = form.get("file");
  if (!(file instanceof File)) return { error: "Choose a file to upload." };
  if (file.size > 4 * 1024 * 1024) return { error: "Use a file up to 4 MiB." };
  const checked = await validateDocumentFile(file);
  if (checked.error) return { error: checked.error };
  const digest = hashShareToken(token);
  const slot = await service
    .rpc("reserve_evidence_upload", {
      digest,
      mime: checked.contentType,
      bytes: checked.bytes.length,
    })
    .maybeSingle<{ tenant: string; document: string }>();
  if (slot.error || !slot.data)
    return { error: "This upload link is unavailable." };
  const { tenant, document } = slot.data;
  const verdict = await scanner.scan(checked);
  if (verdict !== "clean") {
    await service.rpc("finish_evidence_upload", {
      digest,
      target: document,
      stored: false,
    });
    return {
      error:
        verdict === "infected"
          ? "The malware scanner rejected this file."
          : "The malware scanner is unavailable. Try again later.",
    };
  }
  const bucket = service.storage.from(documentBucket);
  const path = `${tenant}/${document}`;
  const uploaded = await bucket.upload(path, checked.bytes, {
    contentType: checked.contentType,
    cacheControl: "0",
    upsert: false,
  });
  const finished = await service.rpc("finish_evidence_upload", {
    digest,
    target: document,
    stored: !uploaded.error,
  });
  if (uploaded.error || finished.error || !finished.data) {
    // A failed confirmation can be ambiguous. Preserve a confirmed submission;
    // interrupted uploads remain private and can be revoked by a manager.
    return {
      error:
        "Could not confirm the upload. Contact the person who sent the request before trying again.",
    };
  }
  revalidatePath(`/workspace/${tenant}/documents`);
  return { message: "File received for review. You can close this page." };
}
