"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspaceSession } from "@/lib/auth/access";
import type { Preferences } from "./preferences";

type State = { message?: string; error?: string };

export async function saveNotificationPreferences(
  organisation: string,
  _: State,
  form: FormData,
): Promise<State> {
  const { client, claims } = await requireWorkspaceSession();
  const preferences: Preferences = {
    enabled: form.get("enabled") === "on",
    tasks: form.get("tasks") === "on",
    documents: form.get("documents") === "on",
    rtw: form.get("rtw") === "on",
    personnel: form.get("personnel") === "on",
  };
  const { error } = await client
    .from("notification_preferences")
    .upsert({ ...preferences, user_id: claims.sub }, { onConflict: "user_id" });
  if (error) return { error: "Could not save notification preferences." };
  revalidatePath(`/workspace/${organisation}/notifications`);
  return { message: "Notification preferences saved." };
}
