"use server";

import { allowSecurityRequest } from "@/lib/security/rate-limit";
import { createClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import {
  isManager,
  requireWorkspaceSession,
  workspaceMemberships,
} from "@/lib/auth/access";
import { authConfig } from "@/lib/auth/config";
import { parseUkDate } from "@/lib/dates";
import { isRecordId } from "@/lib/people/records";
import { scopes, sharePageSize, type PublicShareResult } from "./model";
import {
  createShareToken,
  hashSharePasscode,
  hashShareToken,
  validShareToken,
} from "./secrets";

type ShareFormState = { error?: string; token?: string };

type ShareDatabase = {
  public: {
    Tables: Record<never, never>;
    Views: Record<never, never>;
    Functions: {
      issue_passport_share: {
        Args: {
          tenant: string;
          actor: string;
          token_digest: string;
          passcode_digest: string | null;
          visibility: string;
          expires_on: string;
          workers: string[];
          individuals: string[];
          start_on: string | null;
          end_on: string | null;
        };
        Returns: string;
      };
      probe_passport_share: {
        Args: { token_digest: string };
        Returns: "open" | "unavailable" | "locked" | "passcode";
      };
      open_passport_share: {
        Args: {
          token_digest: string;
          passcode_digest: string | null;
          page_offset: number;
        };
        Returns: PublicShareResult;
      };
    };
  };
};

function serviceClient() {
  const config = authConfig();
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!config || !secret) return null;
  return createClient<ShareDatabase>(config.url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function requireShareManager(organisation: string) {
  const session = await requireWorkspaceSession();
  const membership = (await workspaceMemberships()).find(
    (row) => row.organisation_id === organisation,
  );
  if (!membership || !isManager(membership.role)) notFound();
  return session;
}

function text(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

function selectedIds(form: FormData, key: string) {
  return [...new Set(form.getAll(key))].map((value) =>
    typeof value === "string" ? value : "",
  );
}

export async function createPassportShare(
  organisation: string,
  _: ShareFormState,
  form: FormData,
): Promise<ShareFormState> {
  const { claims } = await requireShareManager(organisation);
  if (!(await allowSecurityRequest("passport_manage", claims.sub)))
    return {
      error:
        "Too many attempts or the service is unavailable. Try again shortly.",
    };
  const service = serviceClient();
  if (!service) return { error: "Share links are temporarily unavailable." };
  const scope = text(form, "scope");
  const expiry = parseUkDate(text(form, "expires"));
  const start = scope === "dates" ? parseUkDate(text(form, "from")) : null;
  const end = scope === "dates" ? parseUkDate(text(form, "through")) : null;
  const workers = scope === "people" ? selectedIds(form, "workers") : [];
  const individuals =
    scope === "people" ? selectedIds(form, "individuals") : [];
  const passcode = text(form, "passcode");

  if (!Object.hasOwn(scopes, scope) || !expiry)
    return { error: "Choose a scope and enter an expiry date in DD/MM/YYYY." };
  if (scope === "dates" && (!start || !end || start > end))
    return { error: "Enter a valid start and end date in DD/MM/YYYY." };
  if (
    scope === "people" &&
    (workers.length + individuals.length < 1 ||
      workers.length + individuals.length > 100 ||
      [...workers, ...individuals].some((id) => !isRecordId(id)))
  )
    return { error: "Choose between 1 and 100 people." };
  if (passcode && (passcode.length < 8 || Buffer.byteLength(passcode) > 128)) {
    return {
      error:
        "Use a passcode of at least 8 characters and no more than 128 bytes.",
    };
  }

  const token = createShareToken();
  const digest = hashShareToken(token);
  const { error } = await service.rpc("issue_passport_share", {
    tenant: organisation,
    actor: claims.sub,
    token_digest: digest,
    passcode_digest: passcode
      ? await hashSharePasscode(passcode, digest)
      : null,
    visibility: scope,
    expires_on: expiry,
    workers,
    individuals,
    start_on: start,
    end_on: end,
  });
  if (error)
    return {
      error:
        "Could not create the link. Check the expiry, scope and selected people.",
    };
  revalidatePath(`/workspace/${organisation}/passport`);
  return { token };
}

export async function revokePassportShare(
  organisation: string,
  id: string,
): Promise<{ error?: string }> {
  const { client } = await requireShareManager(organisation);
  if (!isRecordId(id)) notFound();
  const { data, error } = await client.rpc("revoke_passport_share", {
    tenant: organisation,
    share: id,
  });
  if (error || !data) return { error: "Could not revoke the link." };
  revalidatePath(`/workspace/${organisation}/passport`);
  return {};
}

export async function readPassportShare(
  token: string,
  passcode?: string,
  offset = 0,
): Promise<PublicShareResult> {
  if (
    typeof token !== "string" ||
    !validShareToken(token) ||
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    offset > 2_147_483_647 ||
    offset % sharePageSize !== 0
  )
    return { status: "unavailable" };
  if (!(await allowSecurityRequest("passport_read", token)))
    return { status: "rate_limited" };
  const service = serviceClient();
  if (!service) return { status: "unavailable" };

  const digest = hashShareToken(token);
  let proof: string | null = null;
  if (passcode !== undefined) {
    const { data: status, error } = await service.rpc("probe_passport_share", {
      token_digest: digest,
    });
    if (error || status === "unavailable") return { status: "unavailable" };
    if (status === "locked") return { status: "locked" };
    if (status === "passcode") {
      proof =
        typeof passcode === "string" &&
        passcode.length <= 128 &&
        Buffer.byteLength(passcode) <= 128
          ? await hashSharePasscode(passcode, digest)
          : "invalid";
    }
  }
  const { data, error } = await service.rpc("open_passport_share", {
    token_digest: digest,
    passcode_digest: proof,
    page_offset: offset,
  });
  return error || !data ? { status: "unavailable" } : data;
}
