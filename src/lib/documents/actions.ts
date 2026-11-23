"use server";

import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { requireRecordEditor } from "@/lib/auth/access";
import { authConfig } from "@/lib/auth/config";
import { parseUkDate } from "@/lib/dates";
import { validatePeopleLinks } from "@/lib/people/data";
import { isRecordId } from "@/lib/people/records";
import { documentBucket, isDocumentType, validateDocumentFile } from "./model";
import { documentScanner } from "./scanner";

type State = { error?: string; message?: string };

function field(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export async function uploadDocument(
  organisation: string,
  _: State,
  form: FormData,
): Promise<State> {
  const memberClient = await requireRecordEditor(organisation);
  const type = field(form, "documentType");
  const personKind = field(form, "personKind");
  const person = field(form, "person");
  const rawIssueDate = field(form, "issuedOn");
  const rawExpiryDate = field(form, "expiresOn");
  const issuedOn = rawIssueDate ? parseUkDate(rawIssueDate) : null;
  const expiresOn = rawExpiryDate ? parseUkDate(rawExpiryDate) : null;
  const file = form.get("file");

  if (!isDocumentType(type)) return { error: "Choose a document type." };
  if (
    (personKind !== "worker" && personKind !== "individual") ||
    !isRecordId(person)
  ) {
    return { error: "Choose a person from your organisation." };
  }
  if ((rawIssueDate && !issuedOn) || (rawExpiryDate && !expiresOn)) {
    return { error: "Enter dates in DD/MM/YYYY format." };
  }
  if (issuedOn && expiresOn && expiresOn < issuedOn)
    return { error: "Expiry date cannot be before issue date." };
  if (!(file instanceof File)) return { error: "Choose a document to upload." };

  const links = {
    sponsored_worker_id: personKind === "worker" ? person.toLowerCase() : null,
    engaged_individual_id:
      personKind === "individual" ? person.toLowerCase() : null,
  };
  let validated: Awaited<ReturnType<typeof validateDocumentFile>>;
  try {
    const [linkErrors] = await validatePeopleLinks(memberClient, organisation, [
      links,
    ]);
    if (linkErrors.length)
      return { error: "Choose a person from your organisation." };
    validated = await validateDocumentFile(file);
  } catch {
    return { error: "Could not validate the upload. Try again." };
  }
  if (validated.error) return { error: validated.error };

  let scan: Awaited<ReturnType<typeof documentScanner.scan>>;
  try {
    scan = await documentScanner.scan({
      bytes: validated.bytes,
      contentType: validated.contentType,
    });
  } catch {
    return { error: "The malware check is unavailable. Try again later." };
  }
  if (scan === "infected")
    return { error: "The file was rejected by the malware check." };
  if (scan !== "clean" && scan !== "not_scanned")
    return { error: "The malware check is unavailable. Try again later." };

  const config = authConfig();
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!config || !secret) return { error: "Document uploads are unavailable." };
  const service = createClient(config.url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const id = randomUUID();
  const path = `${organisation}/${id}`;
  const { error: metadataError } = await service.from("documents").insert({
    id,
    organisation_id: organisation,
    ...links,
    document_type: type,
    issued_on: issuedOn,
    expires_on: expiresOn,
    content_type: validated.contentType,
    size_bytes: validated.bytes.byteLength,
    scan_status: scan,
  });
  if (metadataError)
    return { error: "Could not prepare the upload. Try again." };

  const bucket = service.storage.from(documentBucket);
  const { error: uploadError } = await bucket.upload(path, validated.bytes, {
    contentType: validated.contentType,
    cacheControl: "0",
    upsert: false,
  });
  if (uploadError) {
    const { error: removeError } = await bucket.remove([path]);
    if (!removeError)
      await service
        .from("documents")
        .delete()
        .eq("id", id)
        .eq("state", "pending");
    return { error: "Could not upload the file. Try again." };
  }

  const { data, error: finalisationError } = await service
    .from("documents")
    .update({ state: "ready" })
    .eq("organisation_id", organisation)
    .eq("id", id)
    .eq("state", "pending")
    .select("id")
    .maybeSingle();
  if (finalisationError || !data) {
    return {
      error:
        "Could not confirm the upload was completed. Refresh the vault before uploading again.",
    };
  }
  revalidatePath(`/workspace/${organisation}/documents`);
  return { message: "Document uploaded." };
}
