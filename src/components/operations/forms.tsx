"use client";

import { useActionState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import {
  approveWorkerChange,
  previewChanges,
  updateAction,
  type ChangeReview,
} from "@/lib/operations/actions";
import {
  createEvidenceRequest,
  reviewEvidence,
} from "@/lib/operations/evidence-actions";
import { workFields } from "@/lib/operations/changes";
import { documentTypes } from "@/lib/documents/model";
import type { Assignment, QueueItem } from "@/lib/operations/queue";
import type { EvidenceRequest } from "@/lib/operations/evidence";
import { ResultMessage } from "./feedback";

export type TeamMember = { user_id: string; display_name: string };
const fieldStyle = "rounded-md border border-input bg-card px-3 py-2";

export function QueueControls({
  tenant,
  item,
  assignment,
  roster,
  manager,
  placement,
}: {
  tenant: string;
  item: QueueItem;
  assignment?: Assignment;
  roster: TeamMember[];
  manager: boolean;
  placement: "row" | "discussion";
}) {
  const [result, action, pending] = useActionState(
    updateAction.bind(null, tenant, item.kind, item.record_id),
    {},
  );
  return (
    <form action={action} className="grid gap-3">
      <fieldset disabled={pending} className="grid gap-3">
        {placement === "row" && manager && roster.length > 0 && (
          <div className="flex flex-wrap items-end gap-2">
            <label className="grid gap-1">
              Assign to
              <select
                name="assignee"
                className={fieldStyle}
                defaultValue={assignment?.assignee ?? ""}
              >
                <option value="">Unassigned</option>
                {roster.map((member) => (
                  <option key={member.user_id} value={member.user_id}>
                    {member.display_name}
                  </option>
                ))}
              </select>
            </label>
            <Button name="operation" value="assign" variant="secondary">
              Save assignment
            </Button>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {placement === "row" && manager && (
            <Button
              name="operation"
              value={assignment?.escalated ? "clear_escalation" : "escalate"}
              variant="secondary"
            >
              {assignment?.escalated ? "Clear escalation" : "Escalate"}
            </Button>
          )}
          {placement === "discussion" && (
            <Button
              name="operation"
              value={assignment?.handed_back ? "accept_handover" : "hand_back"}
              variant="secondary"
            >
              {assignment?.handed_back
                ? "Acknowledge hand-back"
                : "Hand back to client"}
            </Button>
          )}
        </div>
        {placement === "discussion" && (
          <>
            <label className="grid gap-1">
              Comment
              <textarea
                name="comment"
                maxLength={500}
                rows={2}
                className={fieldStyle}
                placeholder="Add a note about the next action. Keep personal details out of comments."
              />
            </label>
            <Button name="operation" value="comment" className="w-fit">
              Add comment
            </Button>
          </>
        )}
      </fieldset>
      <ResultMessage result={result} />
    </form>
  );
}

function ApproveChange({
  tenant,
  row,
}: {
  tenant: string;
  row: NonNullable<ChangeReview["rows"]>[number];
}) {
  const [result, action, pending] = useActionState(
    approveWorkerChange.bind(null, tenant),
    {},
  );
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="worker" value={row.id} />
      <input type="hidden" name="before" value={JSON.stringify(row.before)} />
      <input
        type="hidden"
        name="proposed"
        value={JSON.stringify(row.proposed)}
      />
      {!result.message && (
        <Button className="w-fit" disabled={pending}>
          Apply this change
        </Button>
      )}
      <ResultMessage result={result} />
    </form>
  );
}

export function ChangeInbox({ tenant }: { tenant: string }) {
  const [result, action, pending] = useActionState(
    previewChanges.bind(null, tenant),
    {},
  );
  return (
    <section className="mt-6 grid max-w-3xl gap-4">
      <p>
        Compare an HR or payroll export with existing workers. Use the columns{" "}
        <strong>Reference, Role, Weekly hours, Work location</strong>. Blank
        existing values can be set as the initial record.
      </p>
      <form action={action} className="grid gap-3">
        <label className="grid gap-1">
          Worker changes CSV
          <input type="file" name="csv" accept=".csv,text/csv" required />
        </label>
        <Button className="w-fit" disabled={pending}>
          {pending ? "Comparing…" : "Preview changes"}
        </Button>
      </form>
      <ResultMessage result={result} />
      {result.rows?.map((row) => (
        <article
          key={JSON.stringify(row)}
          className="grid gap-3 rounded-lg border bg-card p-4"
        >
          <h2 className="font-semibold">{row.reference}</h2>
          <ul className="grid gap-1 text-sm">
            {(Object.keys(workFields) as (keyof typeof workFields)[])
              .filter((field) => row.before[field] !== row.proposed[field])
              .map((field) => (
                <li key={field}>
                  {workFields[field]}:{" "}
                  <del>{row.before[field] ?? "No value on file"}</del>
                  {" → "}
                  <strong>{row.proposed[field]}</strong>
                </li>
              ))}
          </ul>
          <ApproveChange tenant={tenant} row={row} />
        </article>
      ))}
    </section>
  );
}

function subscribeToOrigin() {
  return () => {};
}

export function EvidenceRequestForm({
  tenant,
  workers,
}: {
  tenant: string;
  workers: { id: string; full_name: string; reference: string }[];
}) {
  const [result, action, pending] = useActionState(
    createEvidenceRequest.bind(null, tenant),
    {},
  );
  const origin = useSyncExternalStore(
    subscribeToOrigin,
    () => window.location.origin,
    () => "",
  );
  const link = result.token ? `${origin}/evidence#${result.token}` : null;
  return (
    <form action={action} className="grid gap-3">
      <label className="grid gap-1">
        Worker for request
        <select name="worker" className={fieldStyle} required>
          <option value="">Choose a worker</option>
          {workers.map((worker) => (
            <option key={worker.id} value={worker.id}>
              {worker.full_name} · {worker.reference}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1">
        Requested document type
        <select name="document_type" className={fieldStyle} required>
          {Object.entries(documentTypes).map(([key, name]) => (
            <option key={key} value={key}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <Button className="w-fit" disabled={pending || !workers.length}>
        Create request link
      </Button>
      <ResultMessage result={result} />
      {link && (
        <label className="grid gap-1">
          Copy this link now
          <input
            readOnly
            value={link}
            className={fieldStyle}
            onFocus={(event) => event.currentTarget.select()}
          />
        </label>
      )}
    </form>
  );
}

export function EvidenceDecision({
  tenant,
  request,
}: {
  tenant: string;
  request: EvidenceRequest;
}) {
  const [result, action, pending] = useActionState(
    reviewEvidence.bind(null, tenant, request.id),
    {},
  );
  return (
    <form action={action} className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        {request.state === "submitted" && (
          <>
            <a
              className="self-center text-primary underline"
              href={`/workspace/${tenant}/evidence-download/${request.id}`}
            >
              Download for review
            </a>
            <Button name="decision" value="approved" disabled={pending}>
              Approve and file
            </Button>
            <Button
              name="decision"
              value="rejected"
              disabled={pending}
              variant="secondary"
            >
              Reject submission
            </Button>
          </>
        )}
        {["open", "uploading"].includes(request.state) && (
          <Button
            name="decision"
            value="revoked"
            disabled={pending}
            variant="secondary"
          >
            Revoke upload link
          </Button>
        )}
      </div>
      <ResultMessage result={result} />
    </form>
  );
}
