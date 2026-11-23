import { cache } from "react";
import { requireWorkspaceSession } from "@/lib/auth/access";
import type { BillingSummary } from "./model";

export const getWorkspaceBilling = cache(async (organisation: string) => {
  const { client } = await requireWorkspaceSession();
  const { data, error } = await client
    .rpc("workspace_billing", { tenant: organisation })
    .maybeSingle<BillingSummary>();
  if (error) throw new Error("Could not load billing status.");
  return data;
});
