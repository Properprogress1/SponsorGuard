import { createClient } from "@supabase/supabase-js";
import { authConfig } from "@/lib/auth/config";

type PrivacyDatabase = {
  public: {
    Tables: Record<never, never>;
    Views: Record<never, never>;
    Functions: {
      recover_interrupted_evidence: {
        Args: Record<string, never>;
        Returns: undefined;
      };
      purge_security_rate_buckets: {
        Args: Record<string, never>;
        Returns: undefined;
      };
      purge_privacy_due: { Args: { run_on: string }; Returns: number };
      claim_privacy_storage: {
        Args: Record<never, never>;
        Returns: { bucket: string; path: string; lease: string }[];
      };
      finish_privacy_storage: {
        Args: { target_bucket: string; target_path: string; claim: string };
        Returns: undefined;
      };
      log_privacy_download: {
        Args: {
          tenant: string;
          download_kind: "document_link" | "audit_pack_link";
          item: string;
          actor: string;
        };
        Returns: undefined;
      };
    };
  };
};

export function privacyService() {
  const config = authConfig();
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!config || !secret) return null;
  return createClient<PrivacyDatabase>(config.url, secret, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
