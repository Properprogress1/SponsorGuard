"use server";

import { revalidatePath } from "next/cache";
import { requireRecordEditor } from "@/lib/auth/access";
import { parseUkDate } from "@/lib/dates";

type FormState = { error?: string; success?: string };

function refreshReporting(organisation: string) {
  revalidatePath(`/workspace/${organisation}/reporting`);
  revalidatePath(`/workspace/${organisation}/tasks`);
}

export async function recordReportingEvent(
  organisation: string,
  _: FormState,
  form: FormData,
): Promise<FormState> {
  const client = await requireRecordEditor(organisation);
  const rule = form.get("rule");
  const rawDate = form.get("eventOn");
  const date = typeof rawDate === "string" ? parseUkDate(rawDate.trim()) : null;
  if (!date) return { error: "Enter a valid event date in DD/MM/YYYY format." };
  if (typeof rule !== "string" || !/^[a-z][a-z0-9_]*$/.test(rule))
    return { error: "Choose a reporting rule." };

  const { error } = await client.from("reporting_events").insert({
    organisation_id: organisation,
    rule_key: rule,
    event_on: date,
  });
  if (error?.code === "P2001")
    return { error: "No version of that rule applies on the event date." };
  if (error?.code === "P2002")
    return {
      error:
        "The England and Wales bank holiday calendar does not cover the event or deadline year.",
    };
  if (error)
    return {
      error:
        "Could not confirm the event was recorded. Check the list before retrying.",
    };
  refreshReporting(organisation);
  return { success: "Reporting event recorded and task created." };
}

export async function setReportingTaskCompletion(
  organisation: string,
  id: string,
  completed: boolean,
): Promise<FormState> {
  const client = await requireRecordEditor(organisation);
  if (
    !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id) ||
    typeof completed !== "boolean"
  ) {
    return { error: "Invalid task." };
  }
  const { data, error } = await client
    .from("tasks")
    .update({ completed })
    .eq("organisation_id", organisation)
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error || !data) return { error: "Could not change the task status." };
  refreshReporting(organisation);
  return {};
}
