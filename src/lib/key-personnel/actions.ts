"use server";

import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import {
  isManager,
  requireWorkspaceSession,
  workspaceMemberships,
} from "@/lib/auth/access";
import { londonDate, parseUkDate } from "@/lib/dates";
import { isRecordId } from "@/lib/people/records";
import { handoverSteps, personnelRoles, smsMfa } from "./model";

type State = { error?: string; success?: string };

async function requireManager(organisation: string) {
  const { client } = await requireWorkspaceSession();
  const membership = (await workspaceMemberships()).find(
    (item) => item.organisation_id === organisation,
  );
  if (!membership || !isManager(membership.role)) notFound();
  return client;
}

function refresh(organisation: string) {
  revalidatePath(`/workspace/${organisation}/key-personnel`);
  revalidatePath(`/workspace/${organisation}/tasks`);
}

export async function savePersonnel(
  organisation: string,
  id: string | null,
  _: State,
  form: FormData,
): Promise<State> {
  const client = await requireManager(organisation);
  const name = form.get("name");
  const role = form.get("role");
  const mfa = form.get("mfa");
  const login = form.get("login");
  const date =
    typeof login === "string" && login.trim()
      ? parseUkDate(login.trim())
      : null;
  if (
    typeof name !== "string" ||
    name.trim().length < 1 ||
    name.trim().length > 120
  )
    return { error: "Enter a name between 1 and 120 characters." };
  if (
    !personnelRoles.some((option) => option === role) ||
    typeof mfa !== "string" ||
    !Object.hasOwn(smsMfa, mfa)
  )
    return { error: "Choose a role and an SMS MFA status." };
  if (
    typeof login !== "string" ||
    (login.trim() && !date) ||
    (date && date > londonDate())
  )
    return {
      error: "Enter a valid SMS login date in DD/MM/YYYY on or before today.",
    };
  if (id && !isRecordId(id)) return { error: "Invalid personnel record." };

  const values = {
    full_name: name.trim(),
    role,
    sms_mfa: mfa,
    sms_last_login_on: date,
    leaving: form.get("leaving") === "on",
  };
  const query = id
    ? client
        .from("key_personnel")
        .update(values)
        .eq("organisation_id", organisation)
        .eq("id", id)
    : client
        .from("key_personnel")
        .insert({ ...values, organisation_id: organisation });
  const { data, error } = await query.select("id").maybeSingle();
  if (error || !data) return { error: "Could not save the personnel record." };
  refresh(organisation);
  return { success: "Personnel record saved." };
}

export async function setHandoverStep(
  organisation: string,
  id: string,
  step: string,
  complete: boolean,
): Promise<State> {
  const client = await requireManager(organisation);
  if (
    !isRecordId(id) ||
    !Object.hasOwn(handoverSteps, step) ||
    typeof complete !== "boolean"
  )
    return { error: "Invalid handover task." };

  const { data, error } = await client
    .from("personnel_handover_tasks")
    .update({ completed: complete })
    .eq("organisation_id", organisation)
    .eq("personnel_id", id)
    .eq("step", step)
    .select("step")
    .maybeSingle();
  if (error || !data) return { error: "Could not change the handover task." };
  refresh(organisation);
  return { success: complete ? "Task completed." : "Task reopened." };
}
