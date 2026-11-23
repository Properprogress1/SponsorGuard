import { workFields } from "@/lib/operations/changes";
import { UpgradePrompt } from "@/components/billing/workspace";
import type { BillingSummary } from "@/lib/billing/model";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatUkDate, londonDate } from "@/lib/dates";
import { Button } from "@/components/ui/button";
import {
  canEditRecords,
  requireWorkspaceSession,
  type Role,
} from "@/lib/auth/access";
import {
  getPeopleRecord,
  getPersonOptions,
  listPeopleRecords,
  peoplePath,
  type PersonOptions,
} from "@/lib/people/data";
import {
  categories,
  isCategory,
  isRecordId,
  peopleCategory,
  type CategoryKey,
  type PeopleField,
  type PeopleRecord,
} from "@/lib/people/records";
import { listEngagementCategories } from "@/lib/workforce/data";
import { CsvImportForm, PeopleRecordForm } from "./forms";

type SearchParams = Record<string, string | string[] | undefined>;
const textLink =
  "font-medium text-slate-900 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2";

function linkedPerson(options: PersonOptions, field: string, id: string) {
  if (field !== "sponsored_worker_id" && field !== "engaged_individual_id")
    return undefined;
  return options[field].find((person) => person.id === id);
}

function fieldValue(
  field: PeopleField,
  value: string | null,
  options: PersonOptions,
) {
  if (!value) return "—";
  if (field.kind === "date") return formatUkDate(value);
  if (field.kind === "person")
    return linkedPerson(options, field.name, value)?.full_name ?? value;
  return field.choices?.[value] ?? value;
}

function recordTitle(row: PeopleRecord, options: PersonOptions) {
  if (row.full_name || row.reference) return row.full_name ?? row.reference;
  for (const field of [
    "sponsored_worker_id",
    "engaged_individual_id",
  ] as const) {
    if (row[field])
      return (
        linkedPerson(options, field, row[field])?.full_name ?? "Linked person"
      );
  }
  return "Right to work check";
}

function StatusChip({
  category,
  row,
  today,
  filter,
}: {
  category: CategoryKey;
  row: PeopleRecord;
  today: string;
  filter: PeopleField;
}) {
  const value = row[filter.name];
  const followUp = row.follow_up_on;
  const due = category === "rtw" && Boolean(followUp && followUp <= today);
  const label =
    category === "rtw"
      ? due
        ? "Follow-up due"
        : followUp
          ? "Follow-up scheduled"
          : "Check on file"
      : value
        ? filter.choices?.[value]
        : undefined;
  if (!label) return null;
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${due ? "bg-amber-100 text-amber-950" : "bg-slate-200 text-slate-900"}`}
    >
      {label}
    </span>
  );
}

function queryString(params: SearchParams, name: string) {
  const value = params[name];
  return typeof value === "string" ? value : "";
}

function WorkerLimit({
  organisation,
  billing,
}: {
  organisation: string;
  billing: BillingSummary;
}) {
  return (
    <div className="rounded-md border bg-white p-4 text-sm">
      <p>
        Sponsored worker limit reached. {billing.worker_count} of{" "}
        {billing.worker_limit} slots used.
      </p>
      {billing.plan === "core" && (
        <Link href={`/workspace/${organisation}/billing`} className={textLink}>
          View the Pro upgrade
        </Link>
      )}
    </div>
  );
}

export async function PeopleWorkspace({
  organisation,
  role,
  params,
  billing,
}: {
  organisation: string;
  role: Role;
  params: SearchParams;
  billing: BillingSummary;
}) {
  const { client } = await requireWorkspaceSession();
  const category = isCategory(params.category) ? params.category : "workers";
  if (category === "individuals" && billing.plan !== "pro")
    return <UpgradePrompt organisation={organisation} plan="pro" />;
  const atLimit =
    category === "workers" && billing.worker_count >= billing.worker_limit;
  const configured =
    category === "individuals"
      ? await listEngagementCategories(client, organisation)
      : undefined;
  const config = peopleCategory(
    category,
    configured &&
      Object.fromEntries(configured.map(({ key, label }) => [key, label])),
  );
  const listTitle =
    category === "cos" ? config.title : config.title.toLowerCase();
  const fields: readonly PeopleField[] = config.fields;
  const filter: PeopleField = config.filter;
  const id = queryString(params, "record");
  const mode = queryString(params, "mode");
  const editor = canEditRecords(role);
  const editing = mode === "new" || mode === "edit";
  if (atLimit && (mode === "new" || mode === "import"))
    return <WorkerLimit organisation={organisation} billing={billing} />;
  if ((editing || mode === "import") && !editor) notFound();
  if (
    (id && !isRecordId(id)) ||
    (mode === "edit" && !id) ||
    (id && mode && mode !== "edit")
  )
    notFound();

  const listPath = peoplePath(organisation, category);
  const detailPath = id
    ? peoplePath(organisation, category, { record: id })
    : listPath;
  const today = londonDate();

  if (mode === "import") {
    return (
      <section className="mt-6 grid gap-5">
        <Link href={listPath} className={textLink}>
          Back to {listTitle}
        </Link>
        <h2 className="text-xl font-semibold">Import {listTitle}</h2>
        <p className="max-w-xl text-sm text-slate-700">
          Use DD/MM/YYYY or YYYY-MM-DD for dates and record IDs for linked
          people. A file with errors is rejected as a whole.
        </p>
        <CsvImportForm
          key={category}
          organisation={organisation}
          category={category}
        />
      </section>
    );
  }

  if (id || editing) {
    const row = id
      ? await getPeopleRecord(client, organisation, category, id)
      : null;
    const options = await getPersonOptions(
      client,
      organisation,
      fields.map((field) => field.name),
      !editing && row ? [row] : undefined,
    );
    return (
      <section className="mt-6 grid gap-5">
        <Link href={editing ? detailPath : listPath} className={textLink}>
          {editing && id ? "Back to record" : `Back to ${listTitle}`}
        </Link>
        <h2 className="text-xl font-semibold">
          {editing
            ? `${id ? "Edit" : "Add"} ${config.singular}`
            : row && recordTitle(row, options)}
        </h2>
        {editing ? (
          <PeopleRecordForm
            key={id ?? category}
            organisation={organisation}
            category={category}
            id={id || null}
            values={row ?? {}}
            options={options}
            fields={fields}
          />
        ) : (
          row && (
            <>
              {params.saved === "1" && (
                <p role="status" className="font-medium text-emerald-900">
                  Record saved.
                </p>
              )}
              <div>
                <StatusChip
                  category={category}
                  row={row}
                  today={today}
                  filter={filter}
                />
              </div>
              <dl className="grid max-w-2xl gap-4 break-words rounded-lg border bg-white p-5 sm:grid-cols-2">
                {fields.map((field) => (
                  <div key={field.name}>
                    <dt className="text-sm font-semibold text-slate-800">
                      {field.label}
                    </dt>
                    <dd>{fieldValue(field, row[field.name], options)}</dd>
                  </div>
                ))}
                {category === "workers" &&
                  Object.entries(workFields).map(([name, label]) => (
                    <div key={name}>
                      <dt className="text-sm font-semibold text-slate-800">
                        {label}
                      </dt>
                      <dd>
                        {row[name] == null
                          ? "No value on file"
                          : String(row[name])}
                      </dd>
                    </div>
                  ))}
                <div className="sm:col-span-2">
                  <dt className="text-sm font-semibold text-slate-800">
                    Record ID
                  </dt>
                  <dd className="font-mono text-sm">{row.id}</dd>
                </div>
              </dl>
              {editor && (
                <div>
                  <Button asChild>
                    <Link
                      href={peoplePath(organisation, category, {
                        record: id,
                        mode: "edit",
                      })}
                    >
                      Edit record
                    </Link>
                  </Button>
                </div>
              )}
            </>
          )
        )}
      </section>
    );
  }

  const followUpOptions = {
    due: "Follow-up due",
    scheduled: "Follow-up scheduled",
    none: "No follow-up date",
  };
  const rawFollowUp = queryString(params, "followUp");
  const followUp =
    category === "rtw" && Object.hasOwn(followUpOptions, rawFollowUp)
      ? rawFollowUp
      : "";
  const rawChoice = queryString(params, "filter");
  const choice =
    filter.choices && Object.hasOwn(filter.choices, rawChoice) ? rawChoice : "";
  const rawPage = Number(queryString(params, "page"));
  const page =
    Number.isInteger(rawPage) && rawPage > 0 && rawPage <= 10_000 ? rawPage : 1;
  const { rows, count, size } = await listPeopleRecords(
    client,
    organisation,
    category,
    { choice, followUp, today, page },
  );
  const options = await getPersonOptions(
    client,
    organisation,
    fields.map((field) => field.name),
    rows,
  );
  const pageLink = (next: number) =>
    peoplePath(organisation, category, {
      filter: choice,
      followUp,
      page: String(next),
    });
  const secondary =
    category === "workers" || category === "individuals"
      ? "Reference"
      : category === "cos"
        ? "Assigned date"
        : "Check date";

  return (
    <section className="mt-6 grid gap-5">
      <nav aria-label="Record types" className="flex flex-wrap gap-2">
        {Object.entries(categories).map(([key, item]) => (
          <Link
            key={key}
            href={peoplePath(organisation, key as CategoryKey)}
            aria-current={key === category ? "page" : undefined}
            className="rounded-md border border-slate-400 bg-white px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 aria-[current=page]:bg-slate-900 aria-[current=page]:text-white"
          >
            {item.title}
          </Link>
        ))}
      </nav>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">{config.title}</h2>
          <p className="mt-1 text-sm text-slate-700">
            {count} {count === 1 ? "record" : "records"} on file
            {choice || followUp ? " matching these filters" : ""}
          </p>
        </div>
        {editor && !atLimit && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link
                href={peoplePath(organisation, category, { mode: "import" })}
              >
                Import CSV
              </Link>
            </Button>
            <Button asChild>
              <Link href={peoplePath(organisation, category, { mode: "new" })}>
                Add record
              </Link>
            </Button>
          </div>
        )}
      </div>
      {atLimit && <WorkerLimit organisation={organisation} billing={billing} />}
      <form
        action={`/workspace/${organisation}/people`}
        className="flex flex-wrap items-end gap-3"
        aria-label="Filter records"
      >
        <input type="hidden" name="category" value={category} />
        <div className="grid gap-1.5">
          <label className="text-sm font-medium" htmlFor="records-filter">
            {filter.label}
          </label>
          <select
            id="records-filter"
            name="filter"
            defaultValue={choice}
            className="min-h-10 rounded-md border border-slate-500 bg-white px-3 focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <option value="">All</option>
            {Object.entries(filter.choices ?? {}).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
        {category === "rtw" && (
          <div className="grid gap-1.5">
            <label className="text-sm font-medium" htmlFor="records-follow-up">
              Follow-up status
            </label>
            <select
              id="records-follow-up"
              name="followUp"
              defaultValue={followUp}
              className="min-h-10 rounded-md border border-slate-500 bg-white px-3 focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <option value="">All</option>
              {Object.entries(followUpOptions).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        )}
        <Button type="submit" variant="outline">
          Apply filters
        </Button>
        {(choice || followUp) && (
          <Link href={listPath} className={`${textLink} self-center text-sm`}>
            Clear filters
          </Link>
        )}
      </form>

      {rows.length ? (
        <div className="overflow-x-auto rounded-lg border bg-white">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{config.title} on file</caption>
            <thead className="bg-slate-100 text-slate-900">
              <tr>
                <th scope="col" className="p-3">
                  {category === "cos" ? "Reference" : "Person"}
                </th>
                <th scope="col" className="p-3">
                  {secondary}
                </th>
                {category === "rtw" && (
                  <th scope="col" className="p-3">
                    Method
                  </th>
                )}
                <th scope="col" className="p-3">
                  {category === "individuals" ? "Engagement type" : "Status"}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t">
                  <td className="max-w-xs break-words p-3">
                    <Link
                      className={textLink}
                      href={peoplePath(organisation, category, {
                        record: row.id,
                      })}
                    >
                      {recordTitle(row, options)}
                    </Link>
                  </td>
                  <td className="p-3">
                    {row.assigned_on
                      ? formatUkDate(row.assigned_on)
                      : row.checked_on
                        ? formatUkDate(row.checked_on)
                        : row.reference}
                  </td>
                  {category === "rtw" && (
                    <td className="p-3">
                      {filter.choices?.[row.method ?? ""]}
                    </td>
                  )}
                  <td className="p-3">
                    <StatusChip
                      category={category}
                      row={row}
                      today={today}
                      filter={filter}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="rounded-lg border bg-white p-4 text-sm">
          No records match this view.
        </p>
      )}
      {(page > 1 || count > size) && (
        <nav
          aria-label="Record pages"
          className="flex items-center gap-4 text-sm"
        >
          {page > 1 && (
            <Link href={pageLink(page - 1)} className={textLink}>
              Previous
            </Link>
          )}
          <span>Page {page}</span>
          {page * size < count && (
            <Link href={pageLink(page + 1)} className={textLink}>
              Next
            </Link>
          )}
        </nav>
      )}
    </section>
  );
}
