"use server";

import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import {
  canEditRecords,
  isManager,
  requireWorkspaceSession,
  workspaceMemberships,
} from "@/lib/auth/access";
import { getWorkspaceBilling } from "@/lib/billing/data";
import { isRecordId } from "@/lib/people/records";
import { readCsv } from "@/lib/people/csv";
import { changedFields, parseWorkChanges, type WorkDetails } from "./changes";
import { queueLabels, type QueueKind } from "./queue";

export type Result = { error?: string; message?: string };
type Worker = WorkDetails & { id: string; reference: string };
type Change = {
  id: string;
  reference: string;
  before: WorkDetails;
  proposed: WorkDetails;
};
export type ChangeReview = Result & { rows?: Change[] };

async function editor(organisation: string, manager = false) {
  const { client } = await requireWorkspaceSession();
  const membership = (await workspaceMemberships()).find(
    (row) => row.organisation_id === organisation,
  );
  const billing = membership && (await getWorkspaceBilling(organisation));
  if (
    !membership ||
    !billing ||
    billing.plan === "free" ||
    !(manager ? isManager(membership.role) : canEditRecords(membership.role))
  )
    notFound();
  return client;
}

function field(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export async function updateAction(
  organisation: string,
  kind: QueueKind,
  record: string,
  _: Result,
  form: FormData,
): Promise<Result> {
  const operation = field(form, "operation");
  const assignment = operation === "assign";
  const client = await editor(
    organisation,
    assignment || operation === "escalate",
  );
  if (!Object.hasOwn(queueLabels, kind) || !isRecordId(record))
    return { error: "Choose an available action." };
  const assignee = field(form, "assignee");
  const body = field(form, "comment");
  const key = { organisation_id: organisation, kind, record_id: record };
  if (
    operation === "comment"
      ? !body || body.length > 500
      : assignment
        ? assignee !== "" && !isRecordId(assignee)
        : ![
            "escalate",
            "clear_escalation",
            "hand_back",
            "accept_handover",
          ].includes(operation)
  )
    return { error: "Check the action details and try again." };
  if (operation === "clear_escalation") await editor(organisation, true);
  if (operation === "comment") {
    const ensured = await client.from("weekly_actions").upsert(key, {
      onConflict: "organisation_id,kind,record_id",
      ignoreDuplicates: true,
    });
    if (ensured.error)
      return { error: "Could not open this action for comments." };
    const written = await client
      .from("action_comments")
      .insert({ ...key, body });
    if (written.error) return { error: "Could not save the comment." };
  } else {
    const update = assignment
      ? { assignee: assignee || null }
      : operation === "escalate" || operation === "clear_escalation"
        ? { escalated: operation === "escalate" }
        : { handed_back: operation === "hand_back" };
    // Insert only identity first. Updates are limited to the selected field.
    const ensured = await client.from("weekly_actions").upsert(key, {
      onConflict: "organisation_id,kind,record_id",
      ignoreDuplicates: true,
    });
    if (ensured.error) return { error: "Could not open this action." };
    const saved = await client
      .from("weekly_actions")
      .update(update)
      .match(key)
      .select("record_id")
      .maybeSingle();
    if (saved.error || !saved.data)
      return {
        error: "Could not update this action. Check the assignee and access.",
      };
  }
  revalidatePath("/workspace/[organisation]/[section]", "page");
  return {
    message: operation === "comment" ? "Comment added." : "Action updated.",
  };
}

const workColumns = "id, reference, work_role, work_hours, work_location";

export async function previewChanges(
  organisation: string,
  _: ChangeReview,
  form: FormData,
): Promise<ChangeReview> {
  const client = await editor(organisation);
  const file = form.get("csv");
  if (!(file instanceof File)) return { error: "Choose a CSV file." };
  let batch;
  try {
    batch = parseWorkChanges(await readCsv(file));
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Could not read the CSV.",
    };
  }
  const stored = new Map<string, Worker>();
  // Bound query-string sizes for long references and large imports.
  for (let index = 0; index < batch.length; index += 20) {
    const found = await client
      .from("sponsored_workers")
      .select(workColumns)
      .eq("organisation_id", organisation)
      .in(
        "reference",
        batch.slice(index, index + 20).map((row) => row.reference),
      )
      .returns<Worker[]>();
    if (found.error) return { error: "Could not compare the worker register." };
    for (const worker of found.data) stored.set(worker.reference, worker);
  }
  const rows: Change[] = [];
  for (const [index, { reference, ...proposed }] of batch.entries()) {
    const worker = stored.get(reference);
    if (!worker)
      return {
        error: `Record ${index + 2}: worker reference is missing from this organisation.`,
      };
    const { id, work_role, work_hours, work_location } = worker;
    const before = { work_role, work_hours, work_location };
    if (changedFields(before, proposed).length)
      rows.push({ id, reference, before, proposed });
  }
  return {
    rows,
    message: rows.length
      ? `${rows.length} worker ${rows.length === 1 ? "record" : "records"} to review.`
      : "No changes found.",
  };
}

function workDetails(value: unknown): value is WorkDetails {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    [row.work_role, row.work_location].every(
      (field) =>
        field === null ||
        (typeof field === "string" &&
          field.trim().length >= 1 &&
          field.length <= 120),
    ) &&
    (row.work_hours === null ||
      (typeof row.work_hours === "number" &&
        Number.isFinite(row.work_hours) &&
        row.work_hours >= 0 &&
        row.work_hours <= 168))
  );
}

export async function approveWorkerChange(
  organisation: string,
  _: Result,
  form: FormData,
): Promise<Result> {
  const client = await editor(organisation);
  const worker = field(form, "worker");
  let before: unknown;
  let proposed: unknown;
  try {
    before = JSON.parse(field(form, "before"));
    proposed = JSON.parse(field(form, "proposed"));
  } catch {
    return { error: "Upload the CSV again before approving." };
  }
  if (
    !isRecordId(worker) ||
    !workDetails(before) ||
    !workDetails(proposed) ||
    proposed.work_role === null ||
    proposed.work_hours === null ||
    proposed.work_location === null
  )
    return { error: "The proposed change is invalid." };

  const { work_role, work_hours, work_location } = proposed;
  let update = client
    .from("sponsored_workers")
    .update({ work_role, work_hours, work_location })
    .eq("organisation_id", organisation)
    .eq("id", worker);
  for (const key of ["work_role", "work_hours", "work_location"] as const) {
    const previous = before[key];
    update =
      previous === null ? update.is(key, null) : update.eq(key, previous);
  }
  const saved = await update.select("id").maybeSingle();
  if (saved.error || !saved.data)
    return {
      error:
        "Could not apply the change. The record may have changed since preview. Upload the CSV again.",
    };
  revalidatePath(`/workspace/${organisation}/people`);
  return { message: "Worker record updated." };
}
