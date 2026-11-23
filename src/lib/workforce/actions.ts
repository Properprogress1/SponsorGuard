"use server";

import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import {
  isManager,
  requireWorkspaceSession,
  workspaceMemberships,
} from "@/lib/auth/access";
import { validCategoryKey } from "./model";

type CategoryState = { message?: string; error?: string };

export async function saveEngagementCategory(
  organisation: string,
  existingKey: string | null,
  _: CategoryState,
  form: FormData,
): Promise<CategoryState> {
  const { client } = await requireWorkspaceSession();
  const membership = (await workspaceMemberships()).find(
    (item) => item.organisation_id === organisation,
  );
  if (!membership || !isManager(membership.role)) notFound();

  const rawKey = existingKey ?? form.get("key");
  const rawLabel = form.get("label");
  const key = typeof rawKey === "string" ? rawKey.trim().toLowerCase() : "";
  const label = typeof rawLabel === "string" ? rawLabel.trim() : "";
  if (
    !validCategoryKey(key) ||
    !label ||
    label.length > 80 ||
    /[\p{Cc}]/u.test(label)
  ) {
    return {
      error:
        "Enter a valid category identifier and a label of up to 80 characters.",
    };
  }
  const categories = client.from("engagement_categories");
  const query = existingKey
    ? categories
        .update({ label })
        .eq("organisation_id", organisation)
        .eq("key", key)
    : categories.insert({ organisation_id: organisation, key, label });
  const { data, error } = await query.select("key").maybeSingle();
  if (error?.code === "23505")
    return { error: "That category identifier is already in use." };
  if (error || !data) return { error: "Could not save the category." };
  revalidatePath(`/workspace/${organisation}/workforce`);
  revalidatePath(`/workspace/${organisation}/people`);
  return { message: "Category saved." };
}
