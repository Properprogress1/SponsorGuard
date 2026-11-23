"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspaceSession } from "@/lib/auth/access";
import { isRecordId } from "@/lib/people/records";
import { parseChecklist } from "./model";

type State = { message?: string; error?: string };

export async function queueAuditPack(organisation: string): Promise<State> {
  const { client } = await requireWorkspaceSession();
  if (!isRecordId(organisation)) return { error: "Invalid organisation." };
  const { data, error } = await client.rpc("queue_audit_pack", {
    tenant: organisation,
  });
  if (error) return { error: "Could not queue the audit pack." };
  revalidatePath(`/workspace/${organisation}/audit-pack`);
  return {
    message: data
      ? "Audit pack queued."
      : "An audit pack is already queued or generating.",
  };
}

export async function saveAuditChecklist(
  organisation: string,
  _: State,
  form: FormData,
): Promise<State> {
  const { client } = await requireWorkspaceSession();
  const input = form.get("checklist");
  const items = typeof input === "string" ? parseChecklist(input) : null;
  if (!items || !isRecordId(organisation))
    return {
      error: "Use at most 30 checklist items of up to 120 characters each.",
    };
  const { error } = await client.rpc("save_audit_pack_checklist", {
    tenant: organisation,
    items,
  });
  if (error) return { error: "Could not save the checklist." };
  revalidatePath(`/workspace/${organisation}/audit-pack`);
  return { message: "Checklist saved." };
}
