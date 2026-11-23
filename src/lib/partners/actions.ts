"use server";

import { allowSecurityRequest } from "@/lib/security/rate-limit";
import { revalidatePath } from "next/cache";
import { requireWorkspaceSession } from "@/lib/auth/access";
import { validateDocumentFile } from "@/lib/documents/model";
import {
  createShareToken,
  hashShareToken,
  validShareToken,
} from "@/lib/passport/secrets";
import { isRecordId } from "@/lib/people/records";
import { isBrandColour, isPartnerRole, type PartnerRole } from "./model";

type State = { error?: string; message?: string; token?: string };
type Preview = { partner_name: string; role: PartnerRole; expires_at: string };

function refresh(organisation: string) {
  revalidatePath(`/workspace/${organisation}/partners`);
}

export async function savePartnerBrand(
  organisation: string,
  _: State,
  form: FormData,
): Promise<State> {
  const { client } = await requireWorkspaceSession();
  const primary = form.get("primary");
  const accent = form.get("accent");
  if (
    !isRecordId(organisation) ||
    typeof primary !== "string" ||
    typeof accent !== "string" ||
    !isBrandColour(primary) ||
    !isBrandColour(accent)
  )
    return { error: "Enter colours in #RRGGBB format." };

  const uploaded = form.get("logo");
  const clear = form.get("clear_logo") === "on";
  let logo: string | null = null;
  if (uploaded instanceof File && uploaded.size > 0 && !clear) {
    if (
      uploaded.size > 128 * 1024 ||
      !["image/png", "image/jpeg"].includes(uploaded.type)
    )
      return { error: "Choose a PNG or JPEG logo of up to 128 KiB." };
    const checked = await validateDocumentFile(uploaded);
    if ("error" in checked) return { error: checked.error };
    logo = `data:${checked.contentType};base64,${Buffer.from(checked.bytes).toString("base64")}`;
  }
  const { error } = await client.rpc("configure_partner", {
    tenant: organisation,
    primary_hex: primary,
    accent_hex: accent,
    logo,
    clear_logo: clear,
  });
  if (error) return { error: "Could not save partner branding." };
  refresh(organisation);
  return { message: "Partner branding saved." };
}

export async function invitePartnerClient(
  organisation: string,
  _: State,
  form: FormData,
): Promise<State> {
  const { client } = await requireWorkspaceSession();
  const entered = form.get("email");
  const role = form.get("role");
  const email = typeof entered === "string" ? entered.trim() : "";
  if (
    !isRecordId(organisation) ||
    !isPartnerRole(role) ||
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+$/.test(email)
  )
    return {
      error:
        "Enter the client owner’s email address and choose an access role.",
    };

  const token = createShareToken();
  const { error } = await client.rpc("create_partner_invitation", {
    tenant: organisation,
    recipient: email,
    token_digest: hashShareToken(token),
    access_role: role,
  });
  if (error) return { error: "Could not create the client invitation." };
  refresh(organisation);
  return {
    token,
    message:
      "Invitation created. Copy the link to share with the client owner.",
  };
}

export async function inspectPartnerInvite(
  token: string,
): Promise<Preview | null> {
  const { client } = await requireWorkspaceSession();
  if (typeof token !== "string" || !validShareToken(token)) return null;
  if (!(await allowSecurityRequest("partner_invite_read", token))) return null;
  const { data, error } = await client
    .rpc("inspect_partner_invitation", { token_digest: hashShareToken(token) })
    .maybeSingle<Preview>();
  return error ? null : data;
}

export async function consentToPartner(
  _: State,
  form: FormData,
): Promise<State> {
  const { client } = await requireWorkspaceSession();
  const token = form.get("token");
  const tenant = form.get("tenant");
  if (
    typeof token !== "string" ||
    !validShareToken(token) ||
    typeof tenant !== "string" ||
    !isRecordId(tenant)
  )
    return {
      error: "Choose a client organisation and use a valid invitation.",
    };
  if (!(await allowSecurityRequest("partner_invite_read", token)))
    return {
      error:
        "Too many attempts or the service is unavailable. Try again shortly.",
    };
  const { data, error } = await client.rpc("accept_partner_invitation", {
    tenant,
    token_digest: hashShareToken(token),
  });
  if (error?.code === "23505")
    return { error: "This partner is already linked to the organisation." };
  if (error || !data)
    return {
      error:
        "This invitation is unavailable or you cannot approve it for that workspace.",
    };
  refresh(tenant);
  return { message: "Partner access granted." };
}

export async function cancelPartnerInvite(
  organisation: string,
  invitation: string,
): Promise<State> {
  const { client } = await requireWorkspaceSession();
  if (!isRecordId(invitation))
    return { error: "Could not cancel the invitation." };
  const { data, error } = await client.rpc("cancel_partner_invitation", {
    invitation,
  });
  if (error || !data) return { error: "Could not cancel the invitation." };
  refresh(organisation);
  return { message: "Invitation cancelled." };
}

export async function changePartnerAccess(
  organisation: string,
  link: string,
  _: State,
  form: FormData,
): Promise<State> {
  const { client } = await requireWorkspaceSession();
  const access = form.get("action");
  const role = form.get("role");
  if (
    !isRecordId(link) ||
    (access !== "revoke" && (access !== "save" || !isPartnerRole(role)))
  )
    return { error: "Choose an access role or revoke the link." };
  const { data, error } = await client.rpc("update_partner_link", {
    link,
    access_role: access === "revoke" ? null : role,
  });
  if (error || !data) return { error: "Could not change partner access." };
  refresh(organisation);
  return {
    message: access === "revoke" ? "Access revoked." : "Access role saved.",
  };
}
