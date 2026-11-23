import { createClient } from "@supabase/supabase-js";
import { authConfig } from "@/lib/auth/config";
import type { PackClaim, PackFailure, PackSnapshot } from "./model";

type AuditPackDatabase = {
  public: {
    Tables: Record<never, never>;
    Views: Record<never, never>;
    Functions: {
      claim_audit_pack: { Args: Record<never, never>; Returns: PackClaim[] };
      audit_pack_snapshot: {
        Args: { job: string; lease: string };
        Returns: PackSnapshot | null;
      };
      finish_audit_pack: {
        Args: {
          job: string;
          lease: string;
          generated: string | null;
          problem: PackFailure | null;
        };
        Returns: boolean;
      };
    };
  };
};

export function auditPackClient() {
  const config = authConfig();
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!config || !secret) return null;
  return createClient<AuditPackDatabase>(config.url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
