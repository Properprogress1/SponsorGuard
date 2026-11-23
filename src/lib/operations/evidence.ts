import { createClient } from "@supabase/supabase-js";
import { authConfig } from "@/lib/auth/config";

export const evidenceColumns =
  "id,worker_id,document_type,expires_at,state,document_id";

export type EvidenceRequest = {
  id: string;
  worker_id: string;
  document_type: string;
  expires_at: string;
  state:
    "open" | "uploading" | "submitted" | "approved" | "rejected" | "revoked";
  document_id: string | null;
};

export function evidenceStorage() {
  const config = authConfig();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return config && key
    ? createClient(config.url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;
}
