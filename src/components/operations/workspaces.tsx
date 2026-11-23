import Link from "next/link";
import {
  canEditRecords,
  isManager,
  requireWorkspaceSession,
  workspaceMemberships,
  type Role,
} from "@/lib/auth/access";
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
  getQueueSummary,
  queueLabels,
} from "@/lib/operations/queue";
import {
  parseQueueFilter,
  parseQueuePage,
  queueFilters,
  queueHref,
} from "@/lib/operations/queue-filters";
import {
  EvidenceDecision,
  EvidenceRequestForm,
  QueueControls,
  type TeamMember,
} from "./forms";

export async function WeeklyQueue({
  tenant,
  role,
  params,
}: {
  tenant: string;
  role: Role;
  params?: Record<string, string | string[] | undefined>;
}) {
  const full = Boolean(params);
  const RowHeading = full ? "h2" : "h3";
  const filter = parseQueueFilter(params?.filter);
  const page = parseQueuePage(params?.page);
  const size = full ? 25 : 5;
  const { client } = await requireWorkspaceSession();
  const manager = isManager(role);
  const [queue, summary, rosterResult] = await Promise.all([
    getWeeklyQueue(tenant, filter, page, size),
    full ? [] : getQueueSummary(tenant),
    manager
      ? client.rpc("weekly_action_roster", { tenant }).returns<TeamMember[]>()
      : null,
  ]);
  if (rosterResult?.error) throw new Error("Could not load the team roster.");
  const roster: TeamMember[] = Array.isArray(rosterResult?.data)
    ? rosterResult.data
    : [];
  const selected = queue.rows.find(
    (item) => `${item.kind}:${item.record_id}` === params?.item,
  );
  const thread =
    selected &&
    (await client
      .from("action_comments")
      .select("id,body,created_at")
      .match({
        organisation_id: tenant,
        kind: selected.kind,
        record_id: selected.record_id,
      })
      .order("created_at", { ascending: false })
      .limit(30)
      .returns<{ id: string; body: string; created_at: string }[]>());
  if (thread?.error) throw new Error("Could not load the action comments.");

  return (
    <section
      aria-label="Weekly action queue"
      className="mt-6 grid max-w-5xl gap-5"
    >
      {!full && (
        <>
          <h2 className="text-xl font-semibold">This week’s actions</h2>
          <ul className="grid gap-3 sm:grid-cols-3">
            {summary.map(({ filter: category, count }) => (
              <li key={category}>
                <Link
                  href={queueHref(tenant, category)}
                  className="grid h-full gap-1 rounded-xl border bg-card p-4 hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  <span className="text-sm font-semibold">
                    {queueFilters[category]}
                  </span>
                  <span
                    className={
                      category === "overdue" && count
                        ? "text-3xl font-semibold text-destructive"
                        : "text-3xl font-semibold text-primary"
                    }
                  >
                    {count}
                  </span>
                  <span className="text-sm underline underline-offset-4">
                    View actions
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
      {full && (
        <nav aria-label="Action filters" className="flex flex-wrap gap-2">
          {Object.entries(queueFilters).map(([value, label]) => {
            const next = parseQueueFilter(value);
            return (
              <Link
                key={value}
                href={queueHref(tenant, next)}
                aria-current={next === filter ? "page" : undefined}
                className="rounded-lg border bg-card px-3 py-2 text-sm font-semibold hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary aria-[current=page]:border-primary aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground"
              >
                {label}
              </Link>
            );
          })}
        </nav>
      )}
      <p className="text-sm text-muted-foreground">
        {queue.count} {queue.count === 1 ? "action" : "actions"} overdue or due
        within seven days{filter !== "all" && " in this view"}.
      </p>
      {queue.rows.length === 0 && (
        <p className="rounded-lg border bg-card p-4">
          {page > 1 ? (
            <>
              This page has no actions.{" "}
              <Link
                href={queueHref(tenant, filter)}
                className="text-primary underline"
              >
                Return to the first page
              </Link>
              .
            </>
          ) : (
            "There are no actions in this view."
          )}
        </p>
      )}
      {queue.rows.length > 0 && (
        <ul className="grid gap-3">
          {queue.rows.map((item) => {
            const label = queueLabels[item.kind];
            const id = `${item.kind}:${item.record_id}`;
            const name = roster.find(
              (member) => member.user_id === item.assignee,
            )?.display_name;
            const href =
              item.kind === "rtw"
                ? `/workspace/${tenant}/people?category=rtw&record=${item.record_id}`
                : `/workspace/${tenant}/${label.section}`;
            return (
              <li key={id} className="grid gap-3 rounded-xl border bg-card p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <RowHeading className="font-semibold">
                    <Link
                      className="underline decoration-primary/50 underline-offset-4"
                      href={href}
                    >
                      {label.title}
                    </Link>
                  </RowHeading>
                  <time
                    dateTime={item.due_on}
                    className={
                      item.due_on < queue.today
                        ? "font-semibold text-destructive"
                        : "font-semibold text-[#8a560e]"
                    }
                  >
                    {dueLabel(item.due_on)}
                  </time>
                </div>
                <p className="text-sm text-muted-foreground">
                  {item.assignee ? (name ?? "Assigned") : "Unassigned"}
                  {item.escalated && " · Escalated"}
                  {item.handed_back && " · Handed back"}
                </p>
                {full && manager && (
                  <QueueControls
                    tenant={tenant}
                    item={item}
                    assignment={item}
                    manager
                    roster={roster}
                    placement="row"
                  />
                )}
                {full && (
                  <Link
                    href={queueHref(tenant, filter, page, id)}
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
      {full && (page > 1 || queue.count > size) && (
        <nav
          aria-label="Action pages"
          className="flex flex-wrap items-center gap-4 text-sm"
        >
          {page > 1 && (
            <Link
              className="text-primary underline"
              href={queueHref(tenant, filter, page - 1)}
            >
              Previous page
            </Link>
          )}
          {queue.rows.length > 0 && (
            <span>
              Page {page} of {Math.ceil(queue.count / size)}
            </span>
          )}
          {page * size < queue.count && (
            <Link
              className="text-primary underline"
              href={queueHref(tenant, filter, page + 1)}
            >
              Next page
            </Link>
          )}
        </nav>
      )}
      {!full && (
        <Link
          className="w-fit font-semibold text-primary underline"
          href={queueHref(tenant, "all")}
        >
          View weekly action queue
        </Link>
      )}
      {selected && (
        <section
          id="action-detail"
          className="grid gap-3 rounded-xl border bg-card p-5"
        >
          <h2 className="text-lg font-semibold">Action discussion</h2>
          <p>
            {queueLabels[selected.kind].title} · {dueLabel(selected.due_on)}
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
              key={`${selected.kind}:${selected.record_id}`}
              tenant={tenant}
              item={selected}
              assignment={selected}
              manager={manager}
              roster={roster}
              placement="discussion"
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
  const queue = await getWeeklyQueue(id, "all", 1, 3);
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
      {queue.rows.map((row) => (
        <p key={row.record_id} className="mt-2 text-sm">
          {queueLabels[row.kind].title} · {dueLabel(row.due_on)}
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
