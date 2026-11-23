import { createClient } from "@supabase/supabase-js";
import { authConfig } from "@/lib/auth/config";
import type { Digest } from "./digest";

type NotificationDatabase = {
  public: {
    Tables: Record<never, never>;
    Views: Record<never, never>;
    Functions: {
      claim_notification_digests: {
        Args: { run_on: string; batch_size: number };
        Returns: Digest[];
      };
      finish_notification_digests: {
        Args: { delivery_ids: string[]; accepted: boolean };
        Returns: undefined;
      };
      unsubscribe_notification_digests: {
        Args: { opaque_id: string };
        Returns: undefined;
      };
    };
  };
};

export function notificationClient() {
  const config = authConfig();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!config || !key) return null;
  return createClient<NotificationDatabase>(config.url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
