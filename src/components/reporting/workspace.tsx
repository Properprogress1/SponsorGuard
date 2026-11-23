import Link from "next/link";
import {
  canEditRecords,
  requireWorkspaceSession,
  type Role,
} from "@/lib/auth/access";
import { formatUkDate, londonDate } from "@/lib/dates";
import {
  listReportingEvents,
  listReportingRules,
  type ReportingRow,
} from "@/lib/reporting/data";
import {
  deadlineState,
  deadlineStates,
  isDeadlineState,
  type DeadlineState,
} from "@/lib/reporting/model";
import { ReportingEventForm, TaskCompletionForm } from "./forms";

const stateStyle: Record<DeadlineState, string> = {
  overdue: "bg-red-100 text-red-950",
  soon: "bg-amber-100 text-amber-950",
  upcoming: "bg-slate-200 text-slate-950",
  completed: "bg-emerald-100 text-emerald-950",
};

function DeadlineChip({ row, today }: { row: ReportingRow; today: string }) {
  const state = deadlineState(row.due_on, row.tasks.completed, today);
  const label =
    state === "soon" && row.due_on === today
      ? "Due today"
      : deadlineStates[state];
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${stateStyle[state]}`}
    >
      {label}
    </span>
  );
}

function SourceReference({ source }: { source: string }) {
  if (!source.startsWith("https://")) return <span>{source}</span>;
  return (
    <a
      href={source}
      className="font-medium underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      Rule source
    </a>
  );
}

export async function ReportingWorkspace({
  organisation,
  role,
  section,
  params,
}: {
  organisation: string;
  role: Role;
  section: "reporting" | "tasks";
  params: Record<string, string | string[] | undefined>;
}) {
  const { client } = await requireWorkspaceSession();
  const editable = canEditRecords(role);
  const isTasks = section === "tasks";
  const base = `/workspace/${organisation}/${section}`;
  const state = isDeadlineState(params.status) ? params.status : undefined;
  const rawPage = typeof params.page === "string" ? Number(params.page) : 1;
  const page =
    Number.isInteger(rawPage) && rawPage >= 1 && rawPage <= 10_000
      ? rawPage
      : 1;
  const today = londonDate();
  const [listing, rules] = await Promise.all([
    listReportingEvents(client, organisation, today, state, page),
    !isTasks && editable ? listReportingRules(client) : Promise.resolve([]),
  ]);
  const { rows, count, pageSize } = listing;
  const href = (filter?: DeadlineState, next = 1) => {
    const query = new URLSearchParams();
    if (filter) query.set("status", filter);
    if (next > 1) query.set("page", String(next));
    return query.size ? `${base}?${query}` : base;
  };
  const linkStyle =
    "font-medium underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2";

  return (
    <div className="mt-6 grid gap-6">
      {!isTasks && editable && (
        <ReportingEventForm
          organisation={organisation}
          today={today}
          rules={rules}
        />
      )}
      <section className="grid gap-4" aria-labelledby="reporting-list">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="reporting-list" className="text-lg font-semibold">
              {isTasks ? "Reporting tasks" : "Reporting events"}
            </h2>
            <p className="mt-1 text-sm text-slate-700">
              {count}{" "}
              {isTasks
                ? count === 1
                  ? "task"
                  : "tasks"
                : count === 1
                  ? "event"
                  : "events"}
              {state ? " matching this filter" : " on file"}
            </p>
          </div>
          {isTasks ? (
            <Link
              href={`/workspace/${organisation}/reporting`}
              className={linkStyle}
            >
              View reporting events
            </Link>
          ) : (
            <Link
              href={`/workspace/${organisation}/tasks`}
              className={linkStyle}
            >
              View tasks
            </Link>
          )}
        </div>
        <nav className="flex flex-wrap gap-2" aria-label="Deadline filters">
          <Link
            href={href()}
            aria-current={!state ? "page" : undefined}
            className="rounded-md border border-slate-400 bg-white px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 aria-[current=page]:bg-slate-900 aria-[current=page]:text-white"
          >
            All
          </Link>
          {Object.entries(deadlineStates).map(([key, label]) => (
            <Link
              key={key}
              href={href(key as DeadlineState)}
              aria-current={state === key ? "page" : undefined}
              className="rounded-md border border-slate-400 bg-white px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 aria-[current=page]:bg-slate-900 aria-[current=page]:text-white"
            >
              {label}
            </Link>
          ))}
        </nav>
        {rows.length ? (
          <div className="overflow-x-auto rounded-lg border bg-white">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">
                {isTasks ? "Reporting tasks" : "Reporting events"} on file
              </caption>
              <thead className="bg-slate-100">
                <tr>
                  <th scope="col" className="p-3">
                    {isTasks ? "Task" : "Event"}
                  </th>
                  <th scope="col" className="p-3">
                    Event date
                  </th>
                  <th scope="col" className="p-3">
                    Due date
                  </th>
                  <th scope="col" className="p-3">
                    Status
                  </th>
                  {isTasks && editable && (
                    <th scope="col" className="p-3">
                      Action
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const rule = row.reporting_rules;
                  return (
                    <tr key={row.id} className="border-t align-top">
                      <th
                        scope="row"
                        className="max-w-sm break-words p-3 font-medium"
                      >
                        {rule.description}
                        <span className="mt-1 block text-xs font-normal text-slate-700">
                          Version {rule.version} · {rule.working_day_limit}{" "}
                          {rule.working_day_limit === 1
                            ? "working day"
                            : "working days"}
                        </span>
                        {rule.requires_verification && (
                          <span className="mt-1 block text-xs font-semibold text-amber-950">
                            VERIFY against current Home Office guidance
                          </span>
                        )}
                        {!isTasks && (
                          <div className="mt-1 text-xs">
                            <SourceReference source={rule.source_reference} />
                          </div>
                        )}
                      </th>
                      <td className="whitespace-nowrap p-3">
                        {formatUkDate(row.event_on)}
                      </td>
                      <td className="whitespace-nowrap p-3">
                        {formatUkDate(row.due_on)}
                      </td>
                      <td className="p-3">
                        <DeadlineChip row={row} today={today} />
                      </td>
                      {isTasks && editable && (
                        <td className="p-3">
                          <TaskCompletionForm
                            organisation={organisation}
                            taskId={row.tasks.id}
                            completed={row.tasks.completed}
                          />
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="rounded-lg border bg-white p-4 text-sm">
            No {isTasks ? "tasks" : "events"} match this view.
          </p>
        )}
        {(page > 1 || count > pageSize) && (
          <nav
            aria-label={isTasks ? "Task pages" : "Event pages"}
            className="flex items-center gap-4 text-sm"
          >
            {page > 1 && (
              <Link className={linkStyle} href={href(state, page - 1)}>
                Previous
              </Link>
            )}
            <span>Page {page}</span>
            {page * pageSize < count && (
              <Link className={linkStyle} href={href(state, page + 1)}>
                Next
              </Link>
            )}
          </nav>
        )}
      </section>
    </div>
  );
}
