"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspaceSession } from "@/lib/auth/access";
import { parseUkDate } from "@/lib/dates";
import { isRecordId } from "@/lib/people/records";
import { isPersonKind } from "./model";

type State = { error?: string; message?: string };
function refresh(organisation: string) {
  revalidatePath(`/workspace/${organisation}/privacy`);
}
function readText(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export async function savePrivacyRule(
  organisation: string,
  _: State,
  form: FormData,
): Promise<State> {
  const { client } = await requireWorkspaceSession();
  const kind = form.get("kind");
  const effective = parseUkDate(readText(form, "effective"));
  const dayText = readText(form, "days");
  const days = dayText ? Number(dayText) : null;
  const source = readText(form, "source");
  if (
    !isRecordId(organisation) ||
    !isPersonKind(kind) ||
    !effective ||
    !source ||
    source.length > 250 ||
    (days !== null && (!/^\d+$/.test(dayText) || days < 1 || days > 36500))
  ) {
    return {
      error:
        "Enter the person type, effective date, source reference and a valid retention period, or leave the period blank to pause purging.",
    };
  }
  const { error } = await client.rpc("set_privacy_retention", {
    tenant: organisation,
    target_kind: kind,
    effective,
    days,
    source,
  });
  if (error?.code === "22023")
    return { error: "Choose a later effective date than the latest version." };
  if (error) return { error: "Could not save the retention rule." };
  refresh(organisation);
  return { message: "Retention rule version added." };
}

export async function savePersonControls(
  organisation: string,
  kind: string,
  person: string,
  _: State,
  form: FormData,
): Promise<State> {
  const { client } = await requireWorkspaceSession();
  const raw = readText(form, "started");
  const started = raw ? parseUkDate(raw) : null;
  if (
    !isRecordId(organisation) ||
    !isRecordId(person) ||
    !isPersonKind(kind) ||
    (raw && !started)
  ) {
    return {
      error: "Enter a retention start date in DD/MM/YYYY, or leave it blank.",
    };
  }
  const { error } = await client.rpc("set_privacy_person", {
    tenant: organisation,
    target_kind: kind,
    person,
    start_date: started,
    hold: form.get("held") === "on",
  });
  if (error)
    return { error: "Could not save retention settings for this person." };
  refresh(organisation);
  return { message: "Person retention settings saved." };
}

export async function erasePerson(
  organisation: string,
  kind: string,
  person: string,
  _: State,
  form: FormData,
): Promise<State> {
  const { client } = await requireWorkspaceSession();
  if (
    !isRecordId(organisation) ||
    !isRecordId(person) ||
    !isPersonKind(kind) ||
    readText(form, "confirmation") !== "ERASE"
  )
    return { error: "Type ERASE to confirm." };
  const { data, error } = await client.rpc("erase_privacy_person", {
    tenant: organisation,
    target_kind: kind,
    person,
    confirmation: "ERASE",
  });
  if (error || !data)
    return {
      error:
        "Could not erase this record. Check that the person still exists and has no hold.",
    };
  refresh(organisation);
  for (const section of [
    "people",
    "workforce",
    "documents",
    "key-personnel",
    "audit-pack",
    "passport",
    "tasks",
  ]) {
    revalidatePath(`/workspace/${organisation}/${section}`);
  }
  return {
    message:
      "Person records erased. Linked files will be removed by the privacy worker.",
  };
}
