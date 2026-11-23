import { cache } from "react";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { authClient } from "./server";
import { authConfig } from "./config";

export const recoveryCookie = "sponsorguard-recovery";

export const verifiedSession = cache(async () => {
  if (!authConfig()) return null;
  const client = await authClient();
  const { data } = await client.auth.getClaims();
  const claims = data?.claims;
  return claims?.sub ? { client, claims } : null;
});

export async function isRecoverySession(sessionId: unknown) {
  return (
    typeof sessionId === "string" &&
    (await cookies()).get(recoveryCookie)?.value === sessionId
  );
}

export const requireWorkspaceSession = cache(async () => {
  const session = await verifiedSession();
  if (!session) redirect("/login");
  if (await isRecoverySession(session.claims.session_id))
    redirect("/reset-password");
  if (session.claims.aal !== "aal2") redirect("/mfa");
  return session;
});

export const roles = ["owner", "admin", "hr_user", "viewer"] as const;
export type Role = (typeof roles)[number];

export function isManager(role: Role) {
  return role === "owner" || role === "admin";
}

type WorkspaceAccess = {
  organisation_id: string;
  organisation_name: string;
  role: Role;
  via_partner: string | null;
  partner_name: string | null;
};

export const workspaceMemberships = cache(async () => {
  const { client } = await requireWorkspaceSession();
  const results: WorkspaceAccess[] = [];
  const size = 200;
  for (let offset = 0; ; offset += size) {
    const { data, error } = await client
      .rpc("workspace_access")
      .order("via_partner", { nullsFirst: true })
      .order("organisation_id")
      .range(offset, offset + size - 1);
    if (error?.code === "PGRST103") break;
    if (error || !Array.isArray(data))
      throw new Error("Could not load workspace access");
    results.push(...(data as WorkspaceAccess[]));
    if (data.length < size) break;
  }
  return results.map(({ organisation_name, ...membership }) => ({
    ...membership,
    organisations: { name: organisation_name },
  }));
});

export function canEditRecords(role: Role) {
  return isManager(role) || role === "hr_user";
}

export async function requireRecordEditor(organisation: string) {
  const { client } = await requireWorkspaceSession();
  const membership = (await workspaceMemberships()).find(
    (item) => item.organisation_id === organisation,
  );
  if (!membership || !canEditRecords(membership.role)) notFound();
  return client;
}
