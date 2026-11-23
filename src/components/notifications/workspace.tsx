import { requireWorkspaceSession } from "@/lib/auth/access";
import {
  defaultPreferences,
  type Preferences,
} from "@/lib/notifications/preferences";
import { PreferencesForm } from "./preferences-form";

export async function NotificationsWorkspace({
  organisation,
}: {
  organisation: string;
}) {
  const { client, claims } = await requireWorkspaceSession();
  const { data, error } = await client
    .from("notification_preferences")
    .select("enabled, tasks, documents, rtw, personnel")
    .eq("user_id", claims.sub)
    .maybeSingle<Preferences>();
  if (error)
    return (
      <p role="alert" className="mt-5">
        Could not load notification preferences.
      </p>
    );
  return (
    <div className="mt-5">
      <PreferencesForm
        organisation={organisation}
        initial={data ?? defaultPreferences}
      />
    </div>
  );
}
