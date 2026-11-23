import Link from "next/link";
import {
  canEditRecords,
  isManager,
  requireWorkspaceSession,
  workspaceMemberships,
  type Role,
} from "@/lib/auth/access";
import { londonDate } from "@/lib/dates";
import { documentTypes, isDocumentType } from "@/lib/documents/model";
import { londonTime } from "@/lib/passport/model";
import {
  evidenceColumns,
  type EvidenceRequest,
} from "@/lib/operations/evidence";
import { evidenceScanner } from "@/lib/operations/scanner";
import {
  dueLabel,
  getWeeklyQueue,
  queueLabels,
  type QueueKind,
} from "@/lib/operations/queue";
import {
  EvidenceDecision,
  EvidenceRequestForm,
  QueueControls,
  type TeamMember,
} from "./forms";

export async function WeeklyQueue({
  tenant,
  role,
  selected,
  full = false,
}: {
  tenant: string;
  role: Role;
  selected?: string | string[];
  full?: boolean;
}) {
  const queue = await getWeeklyQueue(tenant);
  const { client } = await requireWorkspaceSession();
  const manager = isManager(role);
  const selectedItem = queue.rows.find(
    (item) => `${item.kind}:${item.record_id}` === selected,
  );
  const rosterResult =
    full && manager
      ? await client
          .rpc("weekly_action_roster", { tenant })
          .returns<TeamMember[]>()
      : null;
  if (rosterResult?.error) throw new Error("Could not load the team roster.");
  const roster: TeamMember[] = Array.isArray(rosterResult?.data)
    ? rosterResult.data
    : [];
  const thread =
    selectedItem &&
    (await client
      .from("action_comments")
      .select("id,body,created_at")
      .match({
        organisation_id: tenant,
        kind: selectedItem.kind,
        record_id: selectedItem.record_id,
      })
      .order("created_at", { ascending: false })
      .limit(30)
      .returns<{ id: string; body: string; created_at: string }[]>());
  if (thread && thread.error)
    throw new Error("Could not load the action comments.");
  const assignments = new Map(
    queue.assignments.map((row) => [`${row.kind}:${row.record_id}`, row]),
  );
  const prefix = `/workspace/${tenant}`;
  const today = londonDate();
  return (
    <section
      aria-label="Weekly action queue"
      className="mt-6 grid max-w-4xl gap-4"
    >
      {!full && <h2 className="text-xl font-semibold">This week’s actions</h2>}
      <p>
        {queue.count} {queue.count === 1 ? "action" : "actions"} overdue or due
        within seven days.
      </p>
      {queue.rows.length > 0 && (
        <ul className="grid gap-2">
          {queue.rows.slice(0, full ? 50 : 5).map((item) => {
            const label = queueLabels[item.kind];
            const id = `${item.kind}:${item.record_id}`;
            const assigned = assignments.get(id);
            const name = roster.find(
              (member) => member.user_id === assigned?.assignee,
            )?.display_name;
            const href =
              item.kind === "rtw"
                ? `${prefix}/people?category=rtw&record=${item.record_id}`
                : `${prefix}/${label.section}`;
            return (
              <li key={id} className="grid gap-2 rounded-lg border bg-card p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-semibold">
                    <Link
                      className="underline decoration-primary/50 underline-offset-4"
                      href={href}
                    >
                      {label.title}
                    </Link>
                  </h3>
                  <span
                    className={
                      item.due_on < today
                        ? "font-semibold text-destructive"
                        : "font-semibold text-[#8a560e]"
                    }
                  >
                    {dueLabel(item.due_on)}
                  </span>
                </div>
                <p className="text-sm">
                  {assigned?.assignee ? (name ?? "Assigned") : "Unassigned"}
                  {assigned?.escalated && " · Escalated"}
                  {assigned?.handed_back && " · Handed back"}
                </p>
                {full && (
                  <Link
                    href={`${prefix}/actions?item=${encodeURIComponent(id)}#action-detail`}
                    className="w-fit text-primary underline"
                  >
                    Open action discussion
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {full && queue.count > queue.rows.length && (
        <p>
          Showing the 50 earliest actions. Open the original records for later
          items.
        </p>
      )}
      {!full && (
        <Link
          className="w-fit font-semibold text-primary underline"
          href={`${prefix}/actions`}
        >
          View weekly action queue
        </Link>
      )}
      {selectedItem && (
        <section
          id="action-detail"
          className="grid gap-3 rounded-lg border bg-card p-5"
        >
          <h2 className="text-lg font-semibold">Action discussion</h2>
          <p>
            {queueLabels[selectedItem.kind].title} ·{" "}
            {dueLabel(selectedItem.due_on)}
          </p>
          {thread && thread.data.length > 0 && (
            <ul className="grid gap-2">
              {thread.data.map((comment) => (
                <li key={comment.id} className="border-b pb-2">
                  <p className="whitespace-pre-wrap break-words">
                    {comment.body}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {londonTime(comment.created_at)}
                  </p>
                </li>
              ))}
            </ul>
          )}
          {canEditRecords(role) && (
            <QueueControls
              key={selectedItem.record_id}
              tenant={tenant}
              item={selectedItem}
              assignment={assignments.get(
                `${selectedItem.kind}:${selectedItem.record_id}`,
              )}
              manager={manager}
              roster={roster}
            />
          )}
        </section>
      )}
    </section>
  );
}

export async function AdviserQueue() {
  const clients = (await workspaceMemberships()).filter(
    (membership) => membership.via_partner,
  );
  return (
    <section
      aria-label="Linked client actions"
      className="mt-6 grid max-w-4xl gap-4"
    >
      {clients.length === 0 && (
        <p>Actions appear here once a client approves partner access.</p>
      )}
      {clients.map((client) => (
        <ClientSummary
          key={client.organisation_id}
          id={client.organisation_id}
          name={client.organisations.name}
        />
      ))}
    </section>
  );
}

async function ClientSummary({ id, name }: { id: string; name: string }) {
  const queue = await getWeeklyQueue(id);
  return (
    <article className="rounded-lg border bg-card p-4">
      <h2 className="font-semibold">
        <Link
          className="text-primary underline"
          href={`/workspace/${id}/actions`}
        >
          {name}
        </Link>
      </h2>
      <p>
        {queue.count} {queue.count === 1 ? "action" : "actions"} overdue or due
        within seven days.
      </p>
      {queue.rows.slice(0, 3).map((row) => (
        <p key={row.record_id} className="mt-2 text-sm">
          {queueLabels[row.kind as QueueKind].title} · {dueLabel(row.due_on)}
        </p>
      ))}
    </article>
  );
}

export async function EvidenceRequests({ tenant }: { tenant: string }) {
  const { client } = await requireWorkspaceSession();
  const [requests, workers] = await Promise.all([
    client
      .from("evidence_requests")
      .select(evidenceColumns, { count: "exact" })
      .eq("organisation_id", tenant)
      .order("created_at", { ascending: false })
      .limit(50)
      .returns<EvidenceRequest[]>(),
    client
      .from("sponsored_workers")
      .select("id,full_name,reference")
      .eq("organisation_id", tenant)
      .order("full_name")
      .returns<{ id: string; full_name: string; reference: string }[]>(),
  ]);
  if (requests.error || workers.error)
    throw new Error("Could not load evidence requests.");
  const received = await client
    .from("evidence_requests")
    .select("id", { head: true, count: "exact" })
    .eq("organisation_id", tenant)
    .in("state", ["submitted", "approved", "rejected"]);
  if (received.error) throw new Error("Could not count evidence received.");
  const names = new Map(
    workers.data.map((worker) => [worker.id, worker.full_name]),
  );
  return (
    <section
      aria-label="Evidence requests"
      className="mt-8 grid max-w-3xl gap-4 rounded-xl border bg-card p-5"
    >
      <h2 className="text-xl font-semibold">Evidence requests</h2>
      <p>
        {received.count ?? 0} of {requests.count ?? 0} requested files received.
      </p>
      {evidenceScanner() ? (
        <EvidenceRequestForm tenant={tenant} workers={workers.data} />
      ) : (
        <p>New upload links require an active malware scanner.</p>
      )}
      {requests.data.map((row) => (
        <article key={row.id} className="grid gap-2 border-t pt-3">
          <h3 className="font-semibold">
            {names.get(row.worker_id) ?? "Worker"} ·{" "}
            {isDocumentType(row.document_type)
              ? documentTypes[row.document_type]
              : "Document"}
          </h3>
          <p className="text-sm capitalize">
            {row.state === "open" && row.expires_at < new Date().toISOString()
              ? "Expired"
              : row.state}{" "}
            · expires {londonTime(row.expires_at)}
          </p>
          <EvidenceDecision tenant={tenant} request={row} />
        </article>
      ))}
    </section>
  );
}
